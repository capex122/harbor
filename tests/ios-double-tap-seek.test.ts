// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("iOS native playback mounts fixed fifteen-second side double taps", () => {
  const player = read("src/views/player.tsx");
  const gestures = read("src/views/player/mobile-gesture-stage.tsx");
  assert.match(player, /nativeWebChrome\(\)[\s\S]*<MobileGestureStage/);
  assert.match(gestures, /const DOUBLE_TAP_SEEK_SEC = 15/);
  assert.match(gestures, /side === "R" \? step : -step/);
  assert.match(gestures, /clamp\(seekBase\.current \+ seekAccum\.current, 0, duration\)/);
});
