// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("all player top bars use the native iOS safe-area inset", () => {
  const swift = read("src-tauri/plugins/tauri-plugin-harbor-player/ios/Sources/HarborPlayerPlugin.swift");
  const chrome = read("src/components/player/shells/mobile-chrome.ts");
  assert.match(swift, /--ios-safe-top/);
  assert.match(swift, /orientationDidChangeNotification/);
  assert.match(chrome, /env\(safe-area-inset-top[\s\S]*--ios-safe-top/);
  for (const file of ["transport.tsx", "transport-stremio.tsx", "transport-kids.tsx", "shells/mobile-top-bar.tsx"]) {
    assert.match(read(`src/components/player/${file}`), /SAFE_TOP/);
  }
});
