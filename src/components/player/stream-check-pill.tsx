import { Check, AlertCircle } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useActiveKid } from "@/lib/profiles";

type Variant = "check" | "stalled" | "failed";

export function StreamCheckPill({
  variant,
  visible,
  onDismiss,
  onPickAnother,
  compact,
  live,
}: {
  variant: Variant;
  visible: boolean;
  onDismiss: () => void;
  onPickAnother: () => void;
  compact?: boolean;
  live?: boolean;
}) {
  const t = useT();
  const kid = useActiveKid();
  if (!visible || kid) return null;

  const copy = live
    ? variant === "check"
      ? { title: t("Is the channel playing right?"), sub: t("Wrong channel or source?"), icon: Check, accent: "rgba(255,255,255,0.85)" }
      : variant === "stalled"
        ? { title: t("Channel is taking a while"), sub: t("This source is slow. Try another."), icon: AlertCircle, accent: "#f59e0b" }
        : { title: t("Channel won't load"), sub: t("Try another source."), icon: AlertCircle, accent: "#ef4444" }
    : variant === "check"
      ? { title: t("Does this stream look right?"), sub: t("Wrong episode or quality?"), icon: Check, accent: "rgba(255,255,255,0.85)" }
      : variant === "stalled"
        ? { title: t("Stream is taking a while"), sub: t("Probably not cached. Pick another?"), icon: AlertCircle, accent: "#f59e0b" }
        : { title: t("Stream failed to load"), sub: t("Try a different source."), icon: AlertCircle, accent: "#ef4444" };

  const Icon = copy.icon;

  return (
    <div
      className={`pointer-events-auto absolute left-1/2 z-40 grid w-[calc(100%-2rem)] max-w-[32rem] -translate-x-1/2 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-2xl border border-white/12 bg-black/85 px-3.5 py-3 shadow-[0_18px_48px_-18px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-2xl animate-in fade-in slide-in-from-top-2 duration-300 sm:flex sm:w-auto sm:max-w-[calc(100%-2rem)] sm:gap-3 sm:py-2.5 sm:pe-2.5 ${compact ? "top-2" : "top-7"}`}
      role="status"
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{ background: variant === "check" ? "rgba(255,255,255,0.08)" : `${copy.accent}26` }}
      >
        <Icon size={14} strokeWidth={2.4} style={{ color: copy.accent }} />
      </span>
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="text-[13px] font-semibold leading-snug text-white">{copy.title}</span>
        <span className="text-[11px] leading-snug text-white/55">{copy.sub}</span>
      </div>
      <div className="col-span-2 grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-1.5 sm:ps-1">
        <button
          onClick={onDismiss}
          className="flex h-9 items-center justify-center rounded-full px-3 text-[11.5px] font-semibold text-white/75 transition-colors hover:bg-white/8 hover:text-white sm:h-7"
          aria-label={t("Dismiss")}
        >
          {variant === "check" ? t("Looks good") : t("Dismiss")}
        </button>
        <button
          onClick={onPickAnother}
          className="flex h-9 items-center justify-center rounded-full bg-white/12 px-3 text-[11.5px] font-semibold text-white transition-colors hover:bg-white/22 sm:h-7"
        >
          {live ? t("Other sources") : t("Pick another")}
        </button>
      </div>
    </div>
  );
}
