import { Check, X } from "lucide-react";
import type { ToastInfo } from "./addons-types";

export function Toaster({ toast }: { toast: ToastInfo | null }) {
  if (!toast) return null;
  const isOk = toast.kind === "ok";
  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-[calc(var(--harbor-safe-bottom)+5.25rem)] z-[260] flex justify-center animate-popover-in lg:bottom-6">
      <div
        className={`pointer-events-auto flex min-h-12 w-full max-w-[420px] items-center gap-3 rounded-2xl border bg-elevated/90 p-2.5 pe-4 shadow-[0_20px_60px_-18px_rgba(0,0,0,0.8)] backdrop-blur-2xl backdrop-saturate-150 sm:w-auto sm:min-w-72 ${
          isOk ? "border-edge-soft" : "border-danger/40"
        }`}
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${
            isOk ? "bg-accent/15 text-accent ring-accent/15" : "bg-danger/15 text-danger ring-danger/15"
          }`}
        >
          {isOk ? <Check size={16} strokeWidth={2.6} /> : <X size={16} strokeWidth={2.6} />}
        </span>
        <span className="min-w-0 text-[13.5px] font-semibold leading-snug text-ink">
          {toast.text}
          {toast.addon && (
            <span className="text-ink-muted"> · {toast.addon.name}</span>
          )}
        </span>
      </div>
    </div>
  );
}
