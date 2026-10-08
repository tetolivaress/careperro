const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** Formats a byte count the way the design shows it: "2.4 MB", "310 KB", "0 B". */
export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  const value = bytes / 1024 ** i;
  const fixed = i === 0 ? 0 : value >= 100 ? 0 : decimals;
  return `${value.toFixed(fixed)} ${UNITS[i]}`;
}

/** Percentage saved between two sizes, rounded. Negative when the output grew. */
export function savingsPercent(before: number, after: number): number {
  if (before <= 0) return 0;
  return Math.round((1 - after / before) * 100);
}
