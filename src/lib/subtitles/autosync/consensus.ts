import { dinfo, dwarn } from "@/lib/debug";
import { searchSubtitles } from "@/lib/subtitles/search";
import { fetchAndParse, type SubCue } from "@/lib/subtitles/parser";
import { normalizeLang } from "@/lib/subtitles/language";
import { gatherSubtitleAddons } from "@/lib/subtitles/addon-source";
import type { SubResult, SubSearchQuery } from "@/lib/subtitles/types";
import type { Addon } from "@/lib/addons";
import type { PipelineContext, ConsensusResult } from "./pipeline";

export type { ConsensusResult };

export type ConsensusConfig = {
  providers?: { wyzie?: boolean; addons?: boolean; opensubtitles?: boolean };
  addons?: Addon[];
  preferredLangs?: string[];
  netAllowed?: boolean;
  maxCandidates?: number;
  fetchTimeoutMs?: number;
};

export type ConsensusPort = (ctx: PipelineContext) => Promise<ConsensusResult | null>;

const MIN_LINE_LEN = 3;
const SHINGLE_K = 3;
const MIN_LINES = 20;
const CLUSTER_THRESHOLD = 0.2;
const MIN_ANCHORS = 6;
const MAX_ANCHORS = 200;
const ANCHOR_MAD_TOL = 0.6;
const MAX_ANCHOR_DELTA = 90;
const DEFAULT_MAX_CANDIDATES = 10;
const FETCH_TIMEOUT_MS = 9000;

const TAG_RX = /<[^>]+>|\{[^}]*\}/g;
const HI_RX = /\[[^\]]*\]|\([^)]*\)/g;
const SPEAKER_RX = /^[\p{Lu}0-9][\p{Lu}0-9 .,'#/-]{0,28}:\s/u;
const URL_RX = /https?:\/\/\S+|www\.\S+/g;
const LEAD_DASH_RX = /^\s*[-–—>]+\s*/;
const PUNCT_RX = /[^\p{L}\p{N}\s]/gu;

export function normalizeLine(raw: string): string {
  let s = raw.replace(/\r/g, " ").replace(TAG_RX, " ").replace(HI_RX, " ");
  s = s.replace(URL_RX, " ").replace(/^\s+/, "");
  s = s.replace(LEAD_DASH_RX, "");
  s = s.replace(SPEAKER_RX, "");
  s = s.toLowerCase();
  s = s.replace(PUNCT_RX, " ");
  return s.replace(/\s+/g, " ").trim();
}

export type DialogueSequence = { lines: string[]; times: number[] };

export function dialogueSequence(cues: SubCue[]): DialogueSequence {
  const lines: string[] = [];
  const times: number[] = [];
  for (const c of cues) {
    if (!Number.isFinite(c.start)) continue;
    const n = normalizeLine(String(c.text ?? "").replace(/\n+/g, " "));
    if (n.length >= MIN_LINE_LEN) {
      lines.push(n);
      times.push(c.start);
    }
  }
  return { lines, times };
}

export function wordShingles(lines: string[]): Set<string> {
  const words = lines.join(" ").split(" ").filter(Boolean);
  const set = new Set<string>();
  if (words.length < SHINGLE_K) {
    for (const w of words) set.add(w);
    return set;
  }
  for (let i = 0; i + SHINGLE_K <= words.length; i += 1) {
    set.add(words.slice(i, i + SHINGLE_K).join(" "));
  }
  return set;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let inter = 0;
  for (const x of small) if (big.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
}

type Candidate = {
  url: string;
  lang: string;
  source: string;
  format?: SubResult["format"];
  downloads: number;
  hashMatch: boolean;
  isUser: boolean;
  seq: DialogueSequence;
  shingles: Set<string>;
  cues: SubCue[];
};

const BIN_SEC = 1;
function ranges(cues: SubCue[], from = 0, to = Infinity, shift = 0): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const c of cues) {
    const a = Math.max(from, c.start + shift), b = Math.min(to, c.end + shift);
    if (b <= a) continue;
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b); else out.push([a, b]);
  }
  return out;
}
function dice(a: Array<[number, number]>, b: Array<[number, number]>): number {
  let i = 0, j = 0, overlap = 0, total = 0;
  for (const r of a) total += r[1] - r[0];
  for (const r of b) total += r[1] - r[0];
  while (i < a.length && j < b.length) {
    overlap += Math.max(0, Math.min(a[i][1], b[j][1]) - Math.max(a[i][0], b[j][0]));
    if (a[i][1] < b[j][1]) i++; else j++;
  }
  return total ? 2 * overlap / total : 0;
}
function windowScore(target: SubCue[], reference: SubCue[], from: number, to: number, shift: number): number {
  return dice(ranges(target, from, to, shift), ranges(reference, from, to, 0));
}
export function timingScore(target: SubCue[], reference: SubCue[]): number {
  return dice(ranges(target), ranges(reference));
}
export function timingAnchors(target: SubCue[], reference: SubCue[]): Array<[number, number]> | null {
  const duration = Math.min(target.at(-1)?.end ?? 0, reference.at(-1)?.end ?? 0), window = 240, step = 120;
  if (duration < window) return null;
  const anchors: Array<[number, number]> = [];
  for (let start = MAX_ANCHOR_DELTA; start + window + MAX_ANCHOR_DELTA < duration; start += step) {
    const scores: Array<[number, number]> = [];
    for (let shift = -MAX_ANCHOR_DELTA; shift <= MAX_ANCHOR_DELTA; shift += BIN_SEC) scores.push([windowScore(target, reference, start + shift, start + window + shift, shift), shift]);
    scores.sort((x, y) => y[0] - x[0]);
    const rival = scores.find((s) => Math.abs(s[1] - scores[0][1]) >= 10);
    if (scores[0][0] < .35 || (rival && scores[0][0] - rival[0] < .02)) continue;
    let best = scores[0];
    for (let shift = best[1] - BIN_SEC; shift <= best[1] + BIN_SEC; shift += .1) {
      const score = windowScore(target, reference, start + shift, start + window + shift, shift);
      if (score > best[0]) best = [score, shift];
    }
    const time = start + window / 2;
    anchors.push([time, time + best[1]]);
  }
  const stable = anchors.filter((a, i) => !i || i === anchors.length - 1 || Math.abs(a[1] - a[0] - (anchors[i - 1][1] - anchors[i - 1][0])) < .75 || Math.abs(a[1] - a[0] - (anchors[i + 1][1] - anchors[i + 1][0])) < .75);
  const exact: Array<[number, number]> = stable.length ? [stable[0]] : [];
  for (let i = 1; i < stable.length; i++) {
    const prev = stable[i - 1], cur = stable[i], left = prev[1] - prev[0], right = cur[1] - cur[0];
    if (Math.abs(right - left) >= 2) {
      let cut = prev[0], score = -1;
      for (let at = prev[0] + 10; at < cur[0] - 10; at++) {
        const s = windowScore(target, reference, prev[0] + left, at + left, left) * (at - prev[0]) + windowScore(target, reference, at + right, cur[0] + right, right) * (cur[0] - at);
        if (s > score) { score = s; cut = at; }
      }
      exact.push([cut - .001, cut - .001 + left], [cut, cut + right]);
    }
    exact.push(cur);
  }
  return exact.length >= MIN_ANCHORS ? exact : null;
}

type Cluster = { members: Candidate[]; sources: Set<string> };

function trustScore(c: Candidate): number {
  const src = c.source === "opensubtitles" || c.source === "addon" ? 2 : 1;
  return (c.hashMatch ? 1_000_000 : 0) + c.downloads + src;
}

function clusterCandidates(cands: Candidate[]): Cluster[] {
  const clusters: Cluster[] = [];
  for (const cand of cands) {
    let joined: Cluster | null = null;
    for (const cl of clusters) {
      if (cl.members.some((m) => jaccard(m.shingles, cand.shingles) >= CLUSTER_THRESHOLD)) {
        joined = cl;
        break;
      }
    }
    if (joined) {
      joined.members.push(cand);
      if (!cand.isUser) joined.sources.add(cand.source);
    } else {
      clusters.push({ members: [cand], sources: cand.isUser ? new Set() : new Set([cand.source]) });
    }
  }
  return clusters;
}

function pickMajority(clusters: Cluster[]): Cluster | null {
  let best: Cluster | null = null;
  for (const cl of clusters) {
    if (!best) {
      best = cl;
      continue;
    }
    const dv = cl.sources.size - best.sources.size;
    if (dv > 0 || (dv === 0 && cl.members.length > best.members.length)) best = cl;
  }
  return best;
}

function uniqueLineTimes(c: Candidate): Map<string, number> {
  const counts = new Map<string, number>();
  for (const l of c.seq.lines) counts.set(l, (counts.get(l) ?? 0) + 1);
  const map = new Map<string, number>();
  c.seq.lines.forEach((l, i) => {
    if (counts.get(l) === 1) map.set(l, c.seq.times[i]);
  });
  return map;
}

function medianAbsDev(xs: number[]): { median: number; mad: number } {
  if (xs.length === 0) return { median: 0, mad: Infinity };
  const sorted = [...xs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const dev = sorted.map((x) => Math.abs(x - median)).sort((a, b) => a - b);
  return { median, mad: dev[Math.floor(dev.length / 2)] };
}

function sharedDeltas(a: Map<string, number>, b: Map<string, number>): number[] {
  const out: number[] = [];
  for (const [line, ta] of a) {
    const tb = b.get(line);
    if (tb !== undefined && Math.abs(ta - tb) <= MAX_ANCHOR_DELTA) out.push(ta - tb);
  }
  return out;
}

function corroboratedReference(peers: Candidate[], requireCrossSource: boolean): Candidate | null {
  const ranked = [...peers].sort((x, y) => trustScore(y) - trustScore(x));
  const times = new Map<Candidate, Map<string, number>>();
  const timesOf = (c: Candidate) => {
    let t = times.get(c);
    if (!t) {
      t = uniqueLineTimes(c);
      times.set(c, t);
    }
    return t;
  };
  for (const ref of ranked) {
    const refTimes = timesOf(ref);
    for (const other of ranked) {
      if (other === ref) continue;
      if (requireCrossSource && other.source === ref.source) continue;
      if (!requireCrossSource && other.url === ref.url) continue;
      const deltas = sharedDeltas(refTimes, timesOf(other));
      if (deltas.length >= MIN_ANCHORS && medianAbsDev(deltas).mad <= ANCHOR_MAD_TOL) return ref;
    }
  }
  return null;
}

function buildAnchors(user: Candidate, ref: Candidate): Array<[number, number]> | null {
  const refTimes = uniqueLineTimes(ref);
  const userTimes = uniqueLineTimes(user);
  const raw: Array<[number, number]> = [];
  for (const [line, ut] of userTimes) {
    const rt = refTimes.get(line);
    if (rt !== undefined) raw.push([ut, rt]);
  }
  if (raw.length < MIN_ANCHORS) return null;
  raw.sort((p, q) => p[0] - q[0]);
  const step = raw.length > MAX_ANCHORS ? raw.length / MAX_ANCHORS : 1;
  const out: Array<[number, number]> = [];
  for (let i = 0; i < raw.length; i += step) out.push(raw[Math.floor(i)]);
  return out.length >= MIN_ANCHORS ? out : null;
}

function unknown(agreement = 0): ConsensusResult {
  return { verdict: "unknown", bestCandidate: null, agreement, textAnchors: null };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

function buildQuery(ctx: PipelineContext, langs: string[]): SubSearchQuery {
  const isSeries = ctx.meta?.season !== undefined && ctx.meta?.episode !== undefined;
  return {
    imdbId: ctx.meta?.imdbId,
    tmdbId: ctx.meta?.tmdbId != null ? String(ctx.meta.tmdbId) : undefined,
    type: isSeries ? "series" : "movie",
    season: ctx.meta?.season,
    episode: ctx.meta?.episode,
    langs,
    videoHash: ctx.moviehash,
    videoSize: ctx.moviebytesize,
  };
}

async function fetchCandidate(r: SubResult, timeoutMs: number): Promise<Candidate | null> {
  if (!r.url) return null;
  const parsed = await withTimeout(
    fetchAndParse(r.url, { format: r.format, encoding: r.encoding, lang: r.lang }),
    timeoutMs,
  );
  if (!parsed || parsed.length < MIN_LINES) return null;
  const seq = dialogueSequence(parsed);
  if (seq.lines.length < MIN_LINES) return null;
  return {
    url: r.url,
    lang: r.lang,
    source: r.source,
    format: r.format,
    downloads: r.downloads ?? 0,
    hashMatch: typeof r.hash === "string" && r.hash.length > 0,
    isUser: false,
    seq,
    shingles: wordShingles(seq.lines),
    cues: parsed,
  };
}

function userCandidate(ctx: PipelineContext): Candidate | null {
  const text = ctx.cueText;
  if (!Array.isArray(text) || text.length < MIN_LINES) return null;
  const cues: SubCue[] = ctx.cues.map((c, i) => ({ start: c[0], end: c[1], text: text[i] ?? "" }));
  const seq = dialogueSequence(cues);
  if (seq.lines.length < MIN_LINES) return null;
  return {
    url: "",
    lang: ctx.languages[0] ?? "",
    source: "user",
    downloads: 0,
    hashMatch: false,
    isUser: true,
    seq,
    shingles: wordShingles(seq.lines),
    cues,
  };
}

async function gatherCandidates(ctx: PipelineContext, cfg: ConsensusConfig): Promise<SubResult[]> {
  const providers = cfg.providers ?? {};
  const langs = cfg.preferredLangs && cfg.preferredLangs.length > 0 ? cfg.preferredLangs : ctx.languages;
  let addons = cfg.addons;
  if (!addons && providers.addons !== false) {
    addons = (await withTimeout(gatherSubtitleAddons(null), FETCH_TIMEOUT_MS)) ?? [];
  }
  const results = await withTimeout(
    searchSubtitles(buildQuery(ctx, langs), {
      providers,
      addons: addons ?? [],
      preferredLangs: langs,
    }),
    cfg.fetchTimeoutMs ?? FETCH_TIMEOUT_MS,
  );
  return results ?? [];
}

export async function runConsensus(
  ctx: PipelineContext,
  cfg: ConsensusConfig,
): Promise<ConsensusResult | null> {
  if (cfg.netAllowed === false) return null;
  const user = userCandidate(ctx);
  if (!user) return null;
  const targetLang = normalizeLang(ctx.languages[0] ?? "");

  let results: SubResult[];
  try {
    results = await gatherCandidates(ctx, cfg);
  } catch (e) {
    dwarn("[consensus] search failed", e);
    return unknown();
  }

  const filtered = results.filter((r) => !targetLang || normalizeLang(r.lang) === targetLang);
  const capped = filtered.slice(0, cfg.maxCandidates ?? DEFAULT_MAX_CANDIDATES);
  const timeoutMs = cfg.fetchTimeoutMs ?? FETCH_TIMEOUT_MS;
  const settled = await Promise.all(capped.map((r) => fetchCandidate(r, timeoutMs).catch(() => null)));
  const externals = settled.filter((c): c is Candidate => c !== null);

  const answeringSources = new Set(externals.map((c) => c.source));
  if (answeringSources.size < 2) {
    if (externals.length >= 2) {
      const soloClusters = clusterCandidates([user, ...externals]);
      const soloMajority = pickMajority(soloClusters);
      const soloPeers = soloMajority ? soloMajority.members.filter((m) => !m.isUser) : [];
      if (soloMajority && soloMajority.members.includes(user) && soloPeers.length >= 2) {
        const ref = corroboratedReference(soloPeers, false);
        const textAnchors = ref ? buildAnchors(user, ref) : null;
        const agreement = soloPeers.length / externals.length;
        dinfo(
          `[consensus] single-source fallback agreement=${agreement.toFixed(2)} peers=${soloPeers.length} anchors=${textAnchors?.length ?? 0}`,
        );
        return { verdict: "right", bestCandidate: null, agreement, textAnchors };
      }
    }
    dinfo(`[consensus] only ${answeringSources.size} source(s) answered, unknown`);
    return unknown();
  }

  const clusters = clusterCandidates([user, ...externals]);
  const majority = pickMajority(clusters);
  if (!majority || majority.sources.size < 2) {
    dinfo("[consensus] no majority with >=2 sources, unknown");
    return unknown();
  }

  const agreement = majority.sources.size / answeringSources.size;
  const userInMajority = majority.members.includes(user);
  const peers = majority.members.filter((m) => !m.isUser);

  if (!userInMajority) {
    const best = [...peers].sort((a, b) => trustScore(b) - trustScore(a))[0] ?? null;
    dinfo(`[consensus] verdict=wrong agreement=${agreement.toFixed(2)} sources=${majority.sources.size}`);
    return {
      verdict: "wrong",
      bestCandidate: best ? { url: best.url, lang: best.lang, source: best.source, format: best.format } : null,
      agreement,
      textAnchors: null,
    };
  }

  const ref = corroboratedReference(peers, true);
  const textAnchors = ref ? buildAnchors(user, ref) : null;
  dinfo(
    `[consensus] verdict=right agreement=${agreement.toFixed(2)} sources=${majority.sources.size} anchors=${textAnchors?.length ?? 0}`,
  );
  return { verdict: "right", bestCandidate: null, agreement, textAnchors };
}

export function createConsensusPort(cfg: ConsensusConfig): ConsensusPort {
  return (ctx) => runConsensus(ctx, cfg);
}
