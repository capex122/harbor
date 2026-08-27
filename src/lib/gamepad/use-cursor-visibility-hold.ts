import { useEffect } from "react";
import { acquireGamepadCursorVisibilityHold } from "./cursor-visibility";

export function useGamepadCursorVisibilityHold(active = true) {
  useEffect(() => {
    if (!active) return;
    return acquireGamepadCursorVisibilityHold();
  }, [active]);
}
