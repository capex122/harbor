// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("touch scrolling suppresses its synthetic click without changing taps", () => {
  assert.match(app, /event\.pointerType !== "touch"/);
  assert.match(app, /Math\.hypot[\s\S]{0,120}> 10/);
  assert.match(app, /if \(!dragged\) return;[\s\S]{0,120}event\.preventDefault\(\);[\s\S]{0,80}event\.stopImmediatePropagation\(\);/);
});
