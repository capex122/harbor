import { Settings as SettingsLucide } from "lucide-react";
export function SettingsIcon({ active = false }: { active?: boolean }) {
  return <span className={`harbor-settings-nav-icon inline-flex h-[26px] w-[26px] items-center justify-center ${active ? "is-active" : ""}`}><SettingsLucide size={26} strokeWidth={1.75} /></span>;
}
