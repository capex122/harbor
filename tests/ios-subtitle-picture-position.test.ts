// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";

test("iOS MPV keeps subtitles inside the visible video picture", () => {
  const swift = readFileSync(
    new URL("../src-tauri/plugins/tauri-plugin-harbor-player/ios/Sources/HarborMpvViewController.swift", import.meta.url),
    "utf8",
  );
  assert.match(swift, /mpv_set_option_string\(handle, "sub-use-margins", "no"\)/);
});
