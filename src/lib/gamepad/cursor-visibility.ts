export const GAMEPAD_CURSOR_HOLD_ATTRIBUTE = "data-gamepad-cursor-held-visible";

export type GamepadCursorVisibilityState = {
  active: boolean;
  idle: boolean;
  playerChromeMounted: boolean;
  playerChromeVisible: boolean;
  visibilityHeld: boolean;
};

let visibilityHolds = 0;

function syncVisibilityHoldAttribute() {
  if (typeof document === "undefined") return;
  document.documentElement.toggleAttribute(GAMEPAD_CURSOR_HOLD_ATTRIBUTE, visibilityHolds > 0);
}

export function acquireGamepadCursorVisibilityHold(): () => void {
  visibilityHolds += 1;
  syncVisibilityHoldAttribute();
  let released = false;

  return () => {
    if (released) return;
    released = true;
    visibilityHolds = Math.max(0, visibilityHolds - 1);
    syncVisibilityHoldAttribute();
  };
}

export function shouldShowGamepadCursor(state: GamepadCursorVisibilityState): boolean {
  if (!state.active || state.idle) return false;
  if (state.visibilityHeld) return true;
  return !state.playerChromeMounted || state.playerChromeVisible;
}
