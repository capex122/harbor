// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";

const toast = readFileSync(new URL("../src/components/lists/list-toast.tsx", import.meta.url), "utf8");
const center = readFileSync(new URL("../src/components/notification-center/notification-center.tsx", import.meta.url), "utf8");
const rows = readFileSync(new URL("../src/components/notification-center/notification-rows.tsx", import.meta.url), "utf8");

test("mobile notifications respect the dock, safe area, and touch targets", () => {
  assert.match(toast, /bottom-\[calc\(var\(--harbor-safe-bottom\)\+5\.25rem\)\]/);
  assert.match(center, /max-h-\[min\(78dvh,680px\)\]/);
  assert.match(center, /bottom-\[max\(var\(--harbor-safe-bottom\),0\.75rem\)\]/);
  assert.match(rows, /lg:opacity-0 lg:focus-visible:opacity-100/);
});
