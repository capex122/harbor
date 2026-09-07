// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";

const sidebar = readFileSync(new URL("../src/chrome/sidebar.tsx", import.meta.url), "utf8");

test("mobile dock long press offers the group alternatives, not the displayed page", () => {
  assert.match(sidebar, /const group = \[nav\.id, \.\.\.\(nav\.menu \?\? \[\]\)\]/);
  assert.match(sidebar, /group\.map\(item\)\.find\(\(option\) => option\.view === view\)/);
  assert.match(sidebar, /group\.filter\(\(id\) => id !== displayed\.id\)/);
});
