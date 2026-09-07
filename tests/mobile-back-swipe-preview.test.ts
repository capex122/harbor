// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("interactive back swipe reveals the previous layer beneath the moving page", () => {
  assert.match(app, /const previousKind = stackKinds\.at\(-2\)/);
  assert.match(app, /backSwipeReveal && kind === previousKind/);
  assert.match(app, /harbor-layer-backdrop absolute inset-0 z-0/);
  assert.match(app, /dragSurface = document\.querySelector<HTMLElement>/);
});
