import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Toast = { id: number; text: string };

const listeners = new Set<(t: Toast) => void>();
let seq = 0;

export function emitListToast(text: string): void {
  const toast = { id: ++seq, text };
  for (const fn of listeners) fn(toast);
}

export function ListToastHost() {
  const [toast, setToast] = useState<Toast | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const onToast = (t: Toast) => {
      setToast(t);
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setToast(null), 2400);
    };
    listeners.add(onToast);
    return () => {
      listeners.delete(onToast);
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  if (!toast) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-3 bottom-[calc(var(--harbor-safe-bottom)+5.25rem)] z-[260] flex justify-center animate-popover-in lg:bottom-6">
      <div className="pointer-events-auto flex min-h-12 w-full max-w-[420px] items-center gap-3 rounded-2xl border border-white/15 bg-elevated/90 p-2.5 pe-4 shadow-[0_20px_60px_-18px_rgba(0,0,0,0.8)] backdrop-blur-2xl backdrop-saturate-150 sm:w-auto sm:min-w-72">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent ring-1 ring-inset ring-accent/15">
          <Check size={16} strokeWidth={2.6} />
        </span>
        <span className="min-w-0 text-[13.5px] font-semibold leading-snug text-ink">{toast.text}</span>
      </div>
    </div>,
    document.body,
  );
}
