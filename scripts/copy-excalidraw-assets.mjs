// Copies Excalidraw's font files into public/ so the whiteboard serves them itself
// instead of fetching them from a CDN (window.EXCALIDRAW_ASSET_PATH points here).
import { cpSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const pkgDir = join(process.cwd(), "node_modules", "@excalidraw", "excalidraw");
const src = join(pkgDir, "dist", "prod", "fonts");
const dest = join(process.cwd(), "public", "excalidraw-assets", "fonts");

if (!existsSync(src)) throw new Error(`Excalidraw fonts not found at ${src}`);
rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
