import { useT } from "@/lib/i18n";

export type StreamMode = "both" | "addons" | "p2p";

const MODES: StreamMode[] = ["both", "addons", "p2p"];

export function StreamModeToggle({
  mode,
  onChange,
  className = "",
}: {
  mode: StreamMode;
  onChange: (m: StreamMode) => void;
  className?: string;
}) {
  const t = useT();
  return (
    <div
      role="group"
      aria-label={t("Source mode")}
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-full border border-edge-soft bg-surface/70 p-0.5 ${className}`}
    >
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          aria-pressed={mode === m}
          title={
            m === "both"
              ? t("Use debrid/addon sources and fall back to peer-to-peer")
              : m === "addons"
                ? t("Only addon/debrid sources, never peer-to-peer")
                : t("Only peer-to-peer torrent sources")
          }
          className={`rounded-full px-3 py-1 text-[12px] font-semibold transition-colors ${
            mode === m ? "bg-accent text-canvas" : "text-ink-muted hover:text-ink"
          }`}
        >
          {m === "both" ? t("Both") : m === "addons" ? t("Addons") : t("P2P")}
        </button>
      ))}
    </div>
  );
}
