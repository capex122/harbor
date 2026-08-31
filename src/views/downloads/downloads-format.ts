import type { DownloadItem } from "@/lib/download/downloads-store";

export function fmtBytes(n: number | null): string {
  if (n == null || n <= 0) return "";
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(0)} MB`;
  return `${(n / 1024).toFixed(0)} KB`;
}

export function fmtSpeed(bps: number): string {
  if (bps <= 0) return "";
  if (bps >= 1024 ** 2) return `${(bps / 1024 ** 2).toFixed(1)} MB/s`;
  return `${(bps / 1024).toFixed(0)} KB/s`;
}

export function fmtEta(d: DownloadItem): string {
  const secs =
    d.etaSeconds != null
      ? d.etaSeconds
      : d.bytesPerSec > 0 && d.totalBytes != null
        ? (d.totalBytes - d.receivedBytes) / d.bytesPerSec
        : 0;
  if (secs <= 0) return "";
  if (secs >= 3600) return `${Math.round(secs / 3600)}h left`;
  if (secs >= 60) return `${Math.round(secs / 60)}m left`;
  return `${Math.round(secs)}s left`;
}
