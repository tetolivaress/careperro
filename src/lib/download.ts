/** Triggers a browser download for a Blob. Revokes the object URL afterwards. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Give the browser a tick to start the download before revoking.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** Splits "photo.final.jpg" into { base: "photo.final", ext: "jpg" }. */
export function splitFileName(name: string): { base: string; ext: string } {
  const i = name.lastIndexOf(".");
  if (i <= 0) return { base: name, ext: "" };
  return { base: name.slice(0, i), ext: name.slice(i + 1) };
}

/** Builds an output name such as "photo-edited.webp". */
export function outputFileName(input: string, suffix: string, ext: string): string {
  const { base } = splitFileName(input);
  return `${base}-${suffix}.${ext}`;
}
