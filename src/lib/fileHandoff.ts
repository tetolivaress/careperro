/**
 * Hands files from the home drop zone to the tool page that opens next.
 * Files live only in memory on this tab; nothing is stored or sent anywhere.
 */
let pending: File[] | null = null;

export function stashFiles(files: File[]): void {
  pending = files;
}

/** Returns and clears the pending files, if any. */
export function takeFiles(): File[] | null {
  const f = pending;
  pending = null;
  return f;
}
