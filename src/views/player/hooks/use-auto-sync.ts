import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { PlayerBridge, PlayerSnapshot, TrackInfo } from "@/lib/player/bridge";
import type { PlayerSrc } from "@/lib/view";
import type { Settings } from "@/lib/settings";
import { dwarn } from "@/lib/debug";
import { fetchAndParse, parseSubtitle, type SubCue } from "@/lib/subtitles/parser";
import { toSrt, toVtt } from "@/lib/subtitles/serialize";
import { runAutoSync, type PipelineContext, type PipelineOutcome } from "@/lib/subtitles/autosync/pipeline";
import { buildTierPorts, defaultOsConfig } from "@/lib/subtitles/autosync/context";
import { crowdConfigFromSettings, reportCrowdFeedback, reportVerifiedSync } from "@/lib/subtitles/autosync/crowd-db";
import {
  classifyTorrentSource,
  scheduleProgressiveTorrentSync,
  sourceKindFor,
  type ProgressiveHandle,
} from "@/lib/subtitles/autosync/torrent-sync";
import { resolveSwapCues, type OsConfig } from "@/lib/subtitles/autosync/opensubtitles";
import { type SyncTransform } from "@/lib/subtitles/autosync/fp-gate";
import { transformCues } from "@/lib/subtitles/autosync/html5-sync";
import { embeddedSubIndex } from "@/lib/subtitles/extract";
import { timingAnchors } from "@/lib/subtitles/autosync/consensus";
import { exactAnchorTransform } from "@/lib/subtitles/autosync/smart-layer";
import { DriftMonitor, makeTauriDriftPorts, type DriftDeps } from "@/lib/subtitles/autosync/drift-monitor";
import { buildContext, isLoopback, outcomeScore, subLanguages, toDriftState } from "./use-auto-sync.helpers";

export type AutoSyncStatus = "idle" | "analyzing" | "synced" | "best-effort" | "offer" | "declined" | "error";

export type AutoSyncHandle = {
  status: AutoSyncStatus;
  offer: PipelineOutcome | null;
  applyOffer: () => void;
  revert: () => void;
  retry: () => void;
  run: (referenceId?: string, targetId?: string) => void;
  stop: () => void;
  feedback: (good: boolean) => void;
};

type SubFmt = "srt" | "vtt";
type AppliedState = { transform: SyncTransform | null; originalTrackId: string | null; subDelayBefore: number };
type AutoSyncFlags = { autoSyncDrift?: boolean; subtitleAutoSyncAsr?: boolean };

const MIN_DURATION_SEC = 60;
const MIN_CUES = 4;
const OFFSET_EPS = 0.25;
const RATIO_EPS = 0.003;
const DRIFT_TICK_MS = 4000;
const SWAP_AUTO_APPLY = false;

function isSyncedTrack(t: { title?: string } | null | undefined): boolean {
  return /^Synced \((?:SRT|VTT)\)/.test(t?.title ?? "");
}

export function useAutoSync(params: {
  bridgeRef: RefObject<PlayerBridge | null>;
  src: PlayerSrc;
  snap: PlayerSnapshot;
  engine: "html5" | "mpv";
  settings: Settings;
}): AutoSyncHandle {
  const { bridgeRef, src, snap, engine, settings } = params;
  const [status, setStatus] = useState<AutoSyncStatus>("idle");
  const [offer, setOffer] = useState<PipelineOutcome | null>(null);

  const doneKeyRef = useRef<string | null>(null);
  const firedRef = useRef<{ url: string; langs: Set<string> }>({ url: "", langs: new Set() });
  const appliedRef = useRef<AppliedState>({ transform: null, originalTrackId: null, subDelayBefore: 0 });
  const driftRef = useRef<DriftMonitor | null>(null);
  const driftTimerRef = useRef<number | null>(null);
  const progressiveRef = useRef<ProgressiveHandle | null>(null);
  const bestScoreRef = useRef(-1);
  const retryRef = useRef<(() => void) | null>(null);
  const activeDisposeRef = useRef<(() => void) | null>(null);
  const lastReportRef = useRef<{ ctx: PipelineContext; transform: SyncTransform; confidence: number } | null>(null);
  const liveSnapRef = useRef(snap);
  const srcRef = useRef(src);
  const settingsRef = useRef(settings);
  liveSnapRef.current = snap;
  srcRef.current = src;
  settingsRef.current = settings;

  const flagsRef = useRef<AutoSyncFlags>({});
  flagsRef.current = settings as AutoSyncFlags;

  const selected = snap.subtitleTracks.find((t) => t.selected) ?? null;
  const selectedSynced = isSyncedTrack(selected);
  const ready = false;
  const runKey = selectedSynced ? doneKeyRef.current : ready && selected ? `${src.url}|${selected.id}` : null;

  const stopDrift = useCallback(() => {
    if (driftTimerRef.current !== null) {
      window.clearInterval(driftTimerRef.current);
      driftTimerRef.current = null;
    }
    driftRef.current?.dispose();
    driftRef.current = null;
  }, []);

  const applyTransform = useCallback(async (b: PlayerBridge, cues: SubCue[], fmt: SubFmt, t: SyncTransform, lang?: string) => {
    const a = appliedRef.current;
    if (t.kind === "affine" && Math.abs(t.ratio - 1) < RATIO_EPS) {
      if (Math.abs(t.offsetSec) < OFFSET_EPS && !a.transform) return;
      if (a.originalTrackId) b.setSubtitleTrack(a.originalTrackId);
      b.setSubDelay(t.offsetSec);
      a.transform = t;
      return;
    }
    const finalCues = transformCues(cues, t);
    if (finalCues.length === 0) return;
    const text = fmt === "vtt" ? toVtt(finalCues) : toSrt(finalCues);
    await writeSyncedTrack(b, text, fmt, lang);
    a.transform = t;
  }, []);

  const startDrift = useCallback((b: PlayerBridge, cues: SubCue[]) => {
    if (flagsRef.current.autoSyncDrift !== true || driftRef.current) return;
    const active = srcRef.current;
    const trackKey = doneKeyRef.current ?? active.url;
    const ports = makeTauriDriftPorts(active.url, active.headers, {
      enableAsr: flagsRef.current.subtitleAutoSyncAsr === true,
    });
    const deps: DriftDeps = {
      getState: () => toDriftState(liveSnapRef.current, cues, trackKey),
      setSubDelay: (s) => b.setSubDelay(s),
    };
    const mon = new DriftMonitor(ports, deps);
    driftRef.current = mon;
    driftTimerRef.current = window.setInterval(() => mon.observe(), DRIFT_TICK_MS);
  }, []);

  const handleOutcome = useCallback(
    (o: PipelineOutcome, cues: SubCue[], fmt: SubFmt, cancelled: { current: boolean }) => {
      if (cancelled.current) return;
      const dec = o.decision.decision;
      dwarn(
        `[auto-sync] decision=${dec} reason="${o.decision.reason}" tiers=[${o.tiersRun.join(",")}] bestEffort=${o.bestEffort ?? false}`,
      );
      if (dec === "refuse") {
        if (!appliedRef.current.transform) setStatus("declined");
        return;
      }
      if (dec === "offer" || (o.subSwap && !SWAP_AUTO_APPLY)) {
        setOffer(o);
        if (!appliedRef.current.transform) setStatus("offer");
        return;
      }
      const score = outcomeScore(o);
      if (!o.bestEffort && score <= bestScoreRef.current) return;
      const t = o.candidate;
      const b = bridgeRef.current;
      if (!t || !b) return;
      bestScoreRef.current = score;
      setOffer(null);
      void applyTransform(b, cues, fmt, t).then(() => {
        if (cancelled.current) return;
        setStatus(o.bestEffort ? "best-effort" : "synced");
        startDrift(b, cues);
      });
    },
    [applyTransform, startDrift, bridgeRef],
  );

  const beginRun = useCallback(
    (force: boolean): (() => void) | null => {
      const active = srcRef.current;
      const activeSnap = liveSnapRef.current;
      const activeSelected = activeSnap.subtitleTracks.find((t) => t.selected) ?? null;
      if (engine !== "mpv" || activeSnap.durationSec < MIN_DURATION_SEC) return null;
      if (!activeSelected || activeSelected.external !== true || isSyncedTrack(activeSelected)) return null;

      const key = `${active.url}|${activeSelected.id}`;
      if (!force && doneKeyRef.current === key) return null;

      const cls = classifyTorrentSource(active.url, {
        infoHash: active.streamRef?.infoHash ?? null,
        fileIdx: active.streamRef?.fileIdx ?? null,
      });
      const isTorrent = cls === "torrent";
      if (!isTorrent && isLoopback(active.url)) return null;
      const sourceKind = sourceKindFor(cls, active.url);
      const fileIdx = active.streamRef?.fileIdx ?? 0;

      activeDisposeRef.current?.();

      doneKeyRef.current = key;
      appliedRef.current = { transform: null, originalTrackId: activeSelected.id, subDelayBefore: activeSnap.subDelaySec };
      bestScoreRef.current = -1;
      setOffer(null);
      if (force) setStatus("analyzing");

      const cancelled = { current: false };

      void (async () => {
        const b = bridgeRef.current;
        if (!b) return;
        const cues = await loadCues(b);
        if (cancelled.current) return;
        if (!cues || cues.length < MIN_CUES) {
          if (force) setStatus("error");
          return;
        }
        setStatus("analyzing");
        const fmt = formatOf(b);
        const langs = subLanguages(activeSelected.lang, settingsRef.current.preferredSubLangs);
        const ctx = buildContext(active, activeSnap, sourceKind, cues, langs);
        const os = defaultOsConfig(settingsRef.current);
        const applyAndCapture = (o: PipelineOutcome) => {
          handleOutcome(o, cues, fmt, cancelled);
          if (!cancelled.current && o.candidate && o.candidate.kind === "affine" && o.decision.decision !== "refuse") {
            lastReportRef.current = { ctx, transform: o.candidate, confidence: o.decision.pCorrect };
          }
        };
        try {
          if (isTorrent && ctx.infoHash) {
            const basePorts = buildTierPorts(ctx, settingsRef.current, {
              osConfig: os,
              torrent: { fileIdx, getPositionSec: () => liveSnapRef.current.positionSec },
            });
            progressiveRef.current = scheduleProgressiveTorrentSync({
              ctx,
              fileIdx,
              basePorts,
              osConfig: os ?? undefined,
              getSnapshot: () => ({
                positionSec: liveSnapRef.current.positionSec,
                durationSec: liveSnapRef.current.durationSec || ctx.durationSec,
              }),
              onOutcome: (o) => applyAndCapture(o),
            });
            retryRef.current = () =>
              void runAutoSync(ctx, basePorts, { tryHarder: true }).then((o) => applyAndCapture(o));
          } else {
            const ports = buildTierPorts(ctx, settingsRef.current, { osConfig: os });
            const runDirect = async (tryHarder: boolean) => {
              const outcome = await runAutoSync(ctx, ports, { tryHarder });
              applyAndCapture(outcome);
            };
            retryRef.current = () => void runDirect(true);
            await runDirect(force);
          }
        } catch (e) {
          dwarn("[auto-sync] failed", e);
          if (!cancelled.current) setStatus("error");
        }
      })();

      const dispose = () => {
        cancelled.current = true;
        progressiveRef.current?.stop();
        progressiveRef.current = null;
        stopDrift();
        retryRef.current = null;
        if (activeDisposeRef.current === dispose) activeDisposeRef.current = null;
      };
      activeDisposeRef.current = dispose;
      return dispose;
    },
    [engine, bridgeRef, handleOutcome, stopDrift],
  );

  const selKey = selectedSynced ? doneKeyRef.current : selected ? `${src.url}|${selected.id}` : null;
  useEffect(() => {
    if (!runKey) return () => activeDisposeRef.current?.();
    const snapSel = liveSnapRef.current.subtitleTracks.find((t) => t.selected) ?? null;
    const url = srcRef.current.url;
    const lang = snapSel?.lang ?? "";
    const fired = firedRef.current;
    if (fired.url !== url) {
      fired.url = url;
      fired.langs = new Set();
    }
    if (!fired.langs.has(lang)) {
      fired.langs.add(lang);
      return beginRun(false) ?? undefined;
    }
    return () => activeDisposeRef.current?.();
  }, [selKey, runKey, beginRun]);

  const revert = useCallback(() => {
    progressiveRef.current?.stop();
    progressiveRef.current = null;
    stopDrift();
    const b = bridgeRef.current;
    const a = appliedRef.current;
    if (b) {
      if (a.originalTrackId) b.setSubtitleTrack(a.originalTrackId);
      b.setSubDelay(a.subDelayBefore);
    }
    a.transform = null;
    bestScoreRef.current = -1;
    setOffer(null);
    setStatus("idle");
  }, [bridgeRef, stopDrift]);

  const retry = useCallback(() => {
    retryRef.current?.();
  }, []);

  const run = useCallback((referenceId?: string, targetId?: string) => {
    if (!referenceId || !targetId) return;
    const tracks = liveSnapRef.current.subtitleTracks, reference = tracks.find((t) => t.id === referenceId), target = tracks.find((t) => t.id === targetId), active = srcRef.current;
    if (!reference || !target) return setStatus("error");
    setStatus("analyzing");
    void Promise.all([loadTrackCues(reference, tracks, active, true), loadTrackCues(target, tracks, active)]).then(async ([ref, cues]) => {
      const b = bridgeRef.current, anchors = ref && cues && timingAnchors(cues, ref), transform = anchors && exactAnchorTransform(anchors);
      if (!b || !cues || !transform) return setStatus("error");
      const corrected = ref && reconstructExact(cues, ref, transform);
      if (!corrected || corrected.length < Math.max(MIN_CUES, cues.length / 2)) return setStatus("error");
      appliedRef.current = { transform: null, originalTrackId: target.id, subDelayBefore: liveSnapRef.current.subDelaySec };
      const fmt = formatOfTrack(target), text = fmt === "vtt" ? toVtt(corrected) : toSrt(corrected);
      b.setSubtitleTrack(target.id); await writeSyncedTrack(b, text, fmt, target.lang); setStatus("synced");
    }).catch(() => setStatus("error"));
  }, [bridgeRef]);

  const stop = useCallback(() => {
    activeDisposeRef.current?.();
    revert();
  }, [revert]);

  const feedback = useCallback((good: boolean) => {
    const s = settingsRef.current;
    if (s.subtitleAutoSyncCrowd === false) return;
    const r = lastReportRef.current;
    if (!r) return;
    const cfg = crowdConfigFromSettings(s);
    if (!cfg) return;
    void reportCrowdFeedback(r.ctx.cues, good, cfg);
    if (good) void reportVerifiedSync(r.ctx, r.transform, r.confidence, cfg);
  }, []);

  const applyOffer = useCallback(() => {
    const o = offer;
    const b = bridgeRef.current;
    if (!o || !b) return;
    setOffer(null);
    if (o.subSwap) {
      const os = defaultOsConfig(settingsRef.current) ?? { apiKey: "", userAgent: "Harbor autosync" };
      const swap = o.subSwap;
      void applySwap(b, swap, os).then((ok) => setStatus(ok ? "synced" : "error"));
      return;
    }
    const t = o.candidate;
    const cues = b.getSelectedTrackCues();
    if (!t || !cues) return;
    void applyTransform(b, cues, formatOf(b), t).then(() => {
      setStatus("synced");
      startDrift(b, cues);
    });
  }, [offer, bridgeRef, applyTransform, startDrift]);

  return { status, offer, applyOffer, revert, retry, run, stop, feedback };
}

async function writeSyncedTrack(b: PlayerBridge, text: string, fmt: SubFmt, lang?: string): Promise<void> {
  const pathMod = await import("@tauri-apps/api/path");
  const dir = await pathMod.join(await pathMod.tempDir(), "harbor-subs");
  const filePath = await pathMod.join(dir, `autosync-${Date.now()}.${fmt}`);
  await invoke("save_text_file", { path: filePath, contents: text });
  await b.addSubtitle(filePath, lang, `Synced (${fmt.toUpperCase()})`, true, { provider: "Community" });
  b.setSubDelay(0);
}

async function applySwap(b: PlayerBridge, subSwap: { url: string; format: SubFmt }, os: OsConfig): Promise<boolean> {
  const swap = await resolveSwapCues(subSwap, os);
  if (!swap || swap.cues.length < MIN_CUES) return false;
  const cues: SubCue[] = swap.cues.map((c, i) => ({ start: c[0], end: c[1], text: swap.cueText[i] ?? "" }));
  const text = subSwap.format === "vtt" ? toVtt(cues) : toSrt(cues);
  try {
    await writeSyncedTrack(b, text, subSwap.format);
    return true;
  } catch (e) {
    dwarn("[auto-sync] swap failed", e);
    return false;
  }
}

async function loadCues(b: PlayerBridge): Promise<SubCue[] | null> {
  const inline = b.getSelectedTrackCues();
  if (inline && inline.length > 0) return inline;
  const raw = b.getSelectedTrackUrl();
  if (!raw) return null;
  const readable = /^(https?|blob|data|tauri|asset):/i.test(raw) ? raw : safeConvert(raw);
  if (!readable) return null;
  try {
    return await fetchAndParse(readable);
  } catch {
    return null;
  }
}

function safeConvert(url: string): string | null {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    try {
      return convertFileSrc(url);
    } catch {
      return null;
    }
  }
  return null;
}

function formatOf(b: PlayerBridge): SubFmt {
  const url = b.getSelectedTrackUrl() ?? "";
  return /\.vtt(\?|#|$)/i.test(url) ? "vtt" : "srt";
}

async function loadTrackCues(track: TrackInfo, tracks: TrackInfo[], src: PlayerSrc, timestampsOnly = false): Promise<SubCue[] | null> {
  const raw = track.externalFilename ?? track.url;
  try {
    if (!raw) return parseSubtitle(await invoke<string>("subtitle_extract", { source: src.url, streamIndex: embeddedSubIndex(tracks, track.id), ffIndex: track.streamIndex, timestampsOnly, headers: src.headers ?? null }));
    const cues = /^(https?|blob|data|tauri|asset):/i.test(raw) ? await fetchAndParse(raw) : parseSubtitle(await (await import("@tauri-apps/plugin-fs")).readTextFile(raw));
    return cues.length || !track.url || track.url === raw ? cues : fetchAndParse(track.url);
  } catch { try { return track.url && track.url !== raw ? await fetchAndParse(track.url) : null; } catch { return null; } }
}
function formatOfTrack(track: TrackInfo): SubFmt { return /\.vtt(\?|#|$)/i.test(track.externalFilename ?? track.url ?? "") ? "vtt" : "srt"; }

function reconstructExact(cues: SubCue[], reference: SubCue[], transform: SyncTransform): SubCue[] {
  const mapped = new Map<SubCue, string[]>();
  for (const cue of transformCues(cues, transform)) {
    let best: SubCue | undefined, cost = Infinity, gap = Infinity;
    for (const ref of reference) { const overlap = Math.max(0, Math.min(cue.end, ref.end) - Math.max(cue.start, ref.start)), g = Math.max(ref.start - cue.end, cue.start - ref.end, 0), c = overlap ? -overlap : g; if (c < cost) { best = ref; cost = c; gap = g; } }
    if (best && gap <= 3) mapped.set(best, [...(mapped.get(best) ?? []), cue.text]);
  }
  return reference.filter((cue) => mapped.has(cue)).map((cue) => ({ ...cue, text: mapped.get(cue)!.join("\n") }));
}
