// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";

test("mobile fill control updates the shared aspect mode", () => {
  const shell = readFileSync(
    new URL("../src/components/player/shells/mobile-shell.tsx", import.meta.url),
    "utf8",
  );

  assert.match(shell, /const fillMode = props\.cropMode === "fill"/);
  assert.match(shell, /props\.onCropMode\?\.\(fillMode \? "fit" : "fill"\)/);
  assert.doesNotMatch(shell, /setNativeZoom/);
});
