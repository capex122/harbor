import { invoke } from "@tauri-apps/api/core";
import { emptySnapshot, type PlayerBridge, type PlayerSnapshot, type PlayerSource } from "./bridge";

const call = <T = unknown>(method: string, args: Record<string, unknown> = {}) =>
  invoke<T>("plugin:harbor-mpv|call", { method, args });

export function createIosMpvBridge(): PlayerBridge {
  let host: HTMLElement | null = null;
  let snapshot: PlayerSnapshot = { ...emptySnapshot };
  let timer = 0;
  let resize: ResizeObserver | null = null;
  const listeners = new Set<(value: PlayerSnapshot) => void>();
  const emit = () => listeners.forEach((listener) => listener(snapshot));
  const updateGeometry = async () => {
    if (!host) return;
    const { x, y, width, height } = host.getBoundingClientRect();
    await call("show", { x, y, width, height });
  };
  const poll = async () => {
    try {
      snapshot = await call<PlayerSnapshot>("snapshot");
      emit();
    } catch {
      /* player may be closing */
    }
  };
  const property = (name: string, value: unknown) => void call("setProperty", { name, value });

  return {
    attach(element) {
      host = element;
      element.style.background = "transparent";
      resize = new ResizeObserver(updateGeometry);
      resize.observe(element);
      window.addEventListener("scroll", updateGeometry, true);
      updateGeometry();
    },
    detach() {
      resize?.disconnect();
      resize = null;
      window.removeEventListener("scroll", updateGeometry, true);
      host = null;
      void call("hide");
    },
    async load(source: PlayerSource) {
      snapshot = { ...emptySnapshot, status: "loading" };
      emit();
      await updateGeometry();
      await call("load", source as unknown as Record<string, unknown>);
      window.clearInterval(timer);
      timer = window.setInterval(poll, 250);
      await poll();
    },
    async play() {
      await call("play");
    },
    pause() {
      void call("pause");
    },
    seek(seconds) {
      void call("seek", { seconds });
    },
    frameStep(direction) {
      void call("command", { values: [direction > 0 ? "frame-step" : "frame-back-step"] });
    },
    setVolume(value) {
      property("volume", Math.round(value * 100));
    },
    setMuted(value) {
      property("mute", value);
    },
    setRate(value) {
      property("speed", value);
    },
    setAudioTrack(id) {
      property("aid", id);
    },
    setSubtitleTrack(id) {
      property("sid", id ?? "no");
    },
    setSecondarySubtitleTrack(id) {
      property("secondary-sid", id ?? "no");
    },
    setSubVisible(value) {
      property("sub-visibility", value);
    },
    setSubDelay(value) {
      property("sub-delay", value);
    },
    setAudioDelay(value) {
      property("audio-delay", value);
    },
    setPanscan(value) {
      property("panscan", value);
    },
    setVideoZoom(value) {
      property("video-zoom", value);
    },
    setAspectOverride(value) {
      property("video-aspect-override", value);
    },
    setStretch(value) {
      property("keepaspect", !value);
    },
    setVideoEq(name, value) {
      property(name, value);
    },
    setAnime4kShaders(shaders) {
      property("glsl-shaders", shaders.join(";"));
    },
    setShaderProps(props) {
      Object.entries(props).forEach(([name, value]) => property(name, value));
    },
    async addSubtitle(url, lang, title, select) {
      return await call<boolean>("addSubtitle", { url, lang, title, select });
    },
    getSelectedTrackCues: () => null,
    getSelectedTrackUrl: () => null,
    setAudioNormalize(value) {
      void call("command", { values: ["af", "set", value ? "dynaudnorm" : ""] });
    },
    setAudioProfile(value) {
      property("profile", value);
    },
    setHdrToSdr(value) {
      property("target-colorspace-hint", !value);
    },
    setAudioDevice(value) {
      property("audio-device", value);
    },
    setMediaInfo() {},
    async screenshot() {
      return { ok: false, error: "Screenshots are not available on iOS yet." };
    },
    setAbLoop(a, b) {
      property("ab-loop-a", a ?? "no");
      property("ab-loop-b", b ?? "no");
    },
    async requestPiP() {},
    async exitPiP() {},
    async requestFullscreen() {},
    async exitFullscreen() {},
    capabilities: () => ({
      engine: "mpv",
      pictureInPicture: false,
      airplay: false,
      chromecast: false,
      hdrPassthrough: true,
      hardwareDecode: true,
    }),
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot);
      return () => listeners.delete(listener);
    },
    destroy() {
      window.clearInterval(timer);
      timer = 0;
      resize?.disconnect();
      window.removeEventListener("scroll", updateGeometry, true);
      listeners.clear();
      void call("destroy");
    },
  };
}
