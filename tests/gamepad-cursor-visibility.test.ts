// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import assert from "node:assert/strict";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import { readFileSync } from "node:fs";
// @ts-expect-error Node test types are intentionally outside the browser-only tsconfig.
import test from "node:test";
import {
  acquireGamepadCursorVisibilityHold,
  GAMEPAD_CURSOR_HOLD_ATTRIBUTE,
  shouldShowGamepadCursor,
} from "../src/lib/gamepad/cursor-visibility";

const at = (path: string) => new URL(`../${path}`, import.meta.url);

const base = {
  active: true,
  idle: false,
  playerChromeMounted: true,
  playerChromeVisible: false,
  visibilityHeld: false,
};

test("hidden player chrome hides the Harbor cursor without an interactive overlay", () => {
  assert.equal(shouldShowGamepadCursor(base), false);
});

test("interactive overlays keep the Harbor cursor visible after player chrome hides", () => {
  assert.equal(shouldShowGamepadCursor({ ...base, visibilityHeld: true }), true);
});

test("the cursor's own idle setting still wins while an overlay is open", () => {
  assert.equal(shouldShowGamepadCursor({ ...base, visibilityHeld: true, idle: true }), false);
});

test("releasing the final overlay restores player chrome visibility rules", () => {
  const overlapping = { ...base, visibilityHeld: true };
  assert.equal(shouldShowGamepadCursor(overlapping), true);
  assert.equal(shouldShowGamepadCursor({ ...overlapping, visibilityHeld: false }), false);
});

test("overlapping overlays keep the shared visibility hold until the final release", () => {
  const attributes = new Set<string>();
  const originalDocument = globalThis.document;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      documentElement: {
        toggleAttribute(name: string, force: boolean) {
          if (force) attributes.add(name);
          else attributes.delete(name);
        },
      },
    },
  });

  try {
    const releaseTitleOverlay = acquireGamepadCursorVisibilityHold();
    const releaseContextMenu = acquireGamepadCursorVisibilityHold();
    assert.equal(attributes.has(GAMEPAD_CURSOR_HOLD_ATTRIBUTE), true);

    releaseTitleOverlay();
    assert.equal(attributes.has(GAMEPAD_CURSOR_HOLD_ATTRIBUTE), true);

    releaseContextMenu();
    assert.equal(attributes.has(GAMEPAD_CURSOR_HOLD_ATTRIBUTE), false);
  } finally {
    if (originalDocument === undefined) Reflect.deleteProperty(globalThis, "document");
    else
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: originalDocument,
      });
  }
});

test("right-stick cursor movement wakes the player chrome through synthetic mousemove", () => {
  const player = readFileSync(at("src/views/player.tsx"), "utf8");
  const runner = readFileSync(at("src/components/gamepad-runner.tsx"), "utf8");

  assert.match(player, /data-gamepad-mousemove/);
  assert.match(player, /onMouseMove=\{wakeChrome\}/);
  assert.match(runner, /closest<HTMLElement>\("\[data-gamepad-mousemove\]"\)/);
});

test("controller focus opens and retains the context-menu list flyout", () => {
  const submenu = readFileSync(at("src/components/context-menu/my-list-submenu.tsx"), "utf8");
  const contextMenu = readFileSync(at("src/components/context-menu.tsx"), "utf8");

  assert.match(submenu, /onFocusCapture=\{show\}/);
  assert.match(submenu, /onBlurCapture=/);
  assert.match(submenu, /currentTarget\.contains\(next\)/);
  assert.match(submenu, /aria-expanded=\{open\}/);
  assert.match(contextMenu, /subtitleDetails \? "overflow-y-auto" : "overflow-visible"/);
});
