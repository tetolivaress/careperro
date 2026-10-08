/** Parses "1-3, 5, 8-10" into zero-based page groups. Returns null when anything is out of range. */
export function parseRanges(input: string, pageCount: number): number[][] | null {
  const groups: number[][] = [];
  const parts = input
    .split(/[,;\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  for (const part of parts) {
    const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
    if (!m) return null;
    const a = parseInt(m[1], 10);
    const b = m[2] ? parseInt(m[2], 10) : a;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (lo < 1 || hi > pageCount) return null;
    const g: number[] = [];
    for (let i = lo; i <= hi; i++) g.push(i - 1);
    groups.push(g);
  }
  return groups;
}

/** Splits [0..n) into chunks of `size`. */
export function chunkPages(pageCount: number, size: number): number[][] {
  const out: number[][] = [];
  const step = Math.max(1, Math.floor(size));
  for (let i = 0; i < pageCount; i += step) {
    const g: number[] = [];
    for (let j = i; j < Math.min(i + step, pageCount); j++) g.push(j);
    out.push(g);
  }
  return out;
}
