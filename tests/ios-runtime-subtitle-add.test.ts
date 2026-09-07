// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";

const bridge = readFileSync(new URL("../src/lib/player/android-native.ts", import.meta.url), "utf8");
const caps = readFileSync(new URL("../src/lib/player/native-host.ts", import.meta.url), "utf8");
const swift = readFileSync(new URL("../src-tauri/plugins/tauri-plugin-harbor-player/ios/Sources/HarborPlayerPlugin.swift", import.meta.url), "utf8");
const mpv = readFileSync(new URL("../src-tauri/plugins/tauri-plugin-harbor-player/ios/Sources/HarborMpvViewController.swift", import.meta.url), "utf8");

test("runtime subtitle addition is exposed only by the iOS MPVKit engine", () => {
  assert.match(caps, /addSubtitle: mpv/);
  assert.match(bridge, /prepareSubtitle\([\s\S]*plugin:harbor-player\|add_subtitle/);
  assert.match(swift, /guard let mpv = self\.controller as\? HarborMpvViewController/);
  assert.match(mpv, /func addSubtitle[\s\S]*runSubtitleBatch\(\[args\]\)/);
});
