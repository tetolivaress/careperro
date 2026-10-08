# Browser Toolbox: Implementation Plan

A privacy-first web toolbox where every tool runs 100% in the browser. Files never leave the user's device. No backend.

> Replace `[APP NAME]` with the final product name before starting.

## How to run this plan

Instructions for the coding agent:

1. Work through **one phase at a time**, in order. Do not start a phase until the previous one meets its acceptance criteria.
2. Inside a phase, complete tasks top to bottom and tick each checkbox (`- [x]`) in this file when it is done.
3. After each phase: run `pnpm lint`, `pnpm typecheck`, and `pnpm build`. Fix every error, then commit with the message `phase N: <short summary>`.
4. **Stop after each phase** and report what was built, what was skipped, and any decision that needs review.
5. Follow the conventions in section 3. If a task conflicts with them, ask instead of guessing.
6. Do not add a backend, a database, user accounts, or any network call that sends user files anywhere.

---

## 1. Stack

| Area | Choice |
|---|---|
| Framework | Next.js (App Router) with static export (`output: 'export'`) |
| Language | TypeScript, strict mode |
| Styling | Tailwind CSS + shadcn/ui |
| Icons | lucide-react |
| State | Zustand (one store per editor) |
| Workers | Web Workers + Comlink |
| Package manager | pnpm |
| Deployment | Vercel (static) |
| i18n (phase 8) | next-intl, English and Spanish |

Libraries by category, installed only in the phase that needs them:

| Category | Libraries |
|---|---|
| Images | Canvas / OffscreenCanvas, `react-image-crop`, `@jsquash/avif` (AVIF encoding), `fflate` (zip) |
| PDF | `pdf-lib`, `pdfjs-dist` |
| Audio | Web Audio API, `wavesurfer.js`, `@ffmpeg/ffmpeg` |
| Video | WebCodecs via `mediabunny`, `@ffmpeg/ffmpeg` as fallback |
| Text | `marked`, `diff`, `tesseract.js` |
| Developer | Web Crypto API, `papaparse`, `xlsx` |
| Privacy | Web Crypto API, `qrcode`, `fflate` |

## 2. Architecture

### Folder structure

```
src/
  app/
    layout.tsx
    page.tsx                         # Home
    [category]/page.tsx              # Category grid
    [category]/[tool]/page.tsx       # Tool page (generated from the registry)
  tools/
    registry.ts                      # Single source of truth for all tools
    types.ts
    image/  audio/  video/  pdf/  text/  dev/  privacy/
  components/
    layout/                          # TopBar, Sidebar, ThemeToggle, Search
    shell/                           # DropZone, PreviewArea, SettingsPanel, ExportBar, SizeReadout
    ui/                              # shadcn/ui components
  workers/
    image.worker.ts
    audio.worker.ts
    video.worker.ts
    pdf.worker.ts
  lib/
    download.ts  zip.ts  formatBytes.ts  fileTypes.ts
```

### Tool registry

Every tool is one entry in `src/tools/registry.ts`. The sidebar, search, home grid, category pages, routes (`generateStaticParams`), and SEO metadata are all generated from it.

```ts
export type Category =
  | 'image' | 'audio' | 'video' | 'pdf' | 'text' | 'dev' | 'privacy';

export interface ToolDefinition {
  slug: string;                 // URL segment, e.g. "compress"
  category: Category;
  name: string;
  description: string;          // One line, used on cards and in meta tags
  icon: string;                 // lucide icon name
  accept: string[];             // MIME types, empty for text-only tools
  multiple: boolean;            // Supports batch
  component: () => Promise<{ default: React.ComponentType }>; // Lazy loaded
}
```

Adding a tool must require only: one registry entry and one component folder.

### Shared shell

All file-based tools use the same flow and the same components:

1. `DropZone`: drag and drop, click to browse, paste from clipboard
2. `PreviewArea`: the tool supplies its own preview (image, waveform, player, page grid)
3. `SettingsPanel`: the tool supplies its own controls; right side on desktop, bottom sheet on mobile
4. `ExportBar`: Reset, size readout, primary Download button

Text-based tools (Text, Developer, parts of Privacy) use a second template, `TwoPaneTool`: input on the left, output on the right, options above, copy button.

### Processing layer

- All heavy work runs in Web Workers, exposed through Comlink. The UI thread never encodes or decodes media.
- Worker modules are pure functions: input (file or bitmap plus settings) to output (blob plus metadata). No React, no DOM.
- Heavy libraries (ffmpeg, tesseract, AVIF codec) are loaded with dynamic `import()` only when a tool that needs them opens.

## 3. Conventions

- TypeScript strict; no `any`.
- Components that use browser APIs are client components (`'use client'`); pages stay server components where possible so they export statically.
- Never access `window`, `document`, or `navigator` at module top level.
- Release resources after use: `URL.revokeObjectURL`, `ImageBitmap.close()`, terminate idle workers.
- Every slider that triggers processing is debounced (100 ms) and cancels the previous job.
- Every tool handles five states: empty, drag-over, processing (with progress and cancel), done, error.
- File size limits are defined per tool in the registry and enforced in `DropZone` with a clear error message.
- Accessibility: all controls keyboard reachable, visible focus rings, labels on every input.
- Dark mode first, with a light theme.

---

## Phase 1: Foundation

- [ ] Create the Next.js project with TypeScript, Tailwind, ESLint, and pnpm
- [ ] Configure static export and add `lint`, `typecheck`, and `build` scripts
- [ ] Install and initialize shadcn/ui; add button, slider, tabs, input, select, switch, tooltip, sheet, dialog, progress, sonner
- [ ] Set up dark and light themes with a toggle
- [ ] Create `tools/types.ts` and `tools/registry.ts` with the 7 categories and placeholder entries
- [ ] Build `TopBar` (logo, tool search, theme toggle) and collapsible `Sidebar` generated from the registry
- [ ] Build routes: home, `[category]`, `[category]/[tool]` using `generateStaticParams`
- [ ] Build the home page: hero, drop zone, category cards, popular tools
- [ ] Build the category page: grid of tool cards
- [ ] Build the shell components: `DropZone`, `PreviewArea`, `SettingsPanel`, `ExportBar`, `SizeReadout`
- [ ] Build `lib/`: `download.ts`, `formatBytes.ts`, `fileTypes.ts`
- [ ] Add the persistent "Your files stay on your device" badge
- [ ] Make the layout responsive (settings panel becomes a bottom sheet under 768px)

**Acceptance criteria**
- `pnpm build` produces a static export with one page per registry entry
- Navigation, search, and theme toggle work
- Dropping a file on a placeholder tool shows its name and size

## Phase 2: Image editor

One editor at `/image/editor` with tabs; individual tool URLs (`/image/compress`, `/image/resize`, and so on) open the same editor with the matching tab selected.

- [ ] Create `image.worker.ts` with Comlink: decode with `createImageBitmap`, process on `OffscreenCanvas`, encode with `convertToBlob`
- [ ] Create the editor Zustand store: source file, settings per tab, result blob, status
- [ ] **Compress:** quality slider and format selector (JPG, PNG, WebP, AVIF); live preview; live readout such as "2.4 MB → 310 KB (87% smaller)"
- [ ] Debounce slider changes and cancel stale jobs so the UI never blocks
- [ ] **Compare slider:** draggable before/after divider over the preview
- [ ] **Resize:** width and height inputs, lock-ratio toggle, percentage presets
- [ ] **Convert:** format change; AVIF through `@jsquash/avif`, loaded lazily
- [ ] **Crop:** `react-image-crop` with presets (Free, 1:1, 4:5, 16:9, 9:16)
- [ ] **Rotate and flip**
- [ ] **Watermark:** text or uploaded logo, 9-position grid, opacity and size sliders, tiled option
- [ ] **Filters:** brightness, contrast, saturation, grayscale, blur
- [ ] Apply all edits as one ordered pipeline: crop, rotate, resize, filters, watermark, encode
- [ ] Reset button and Download button with a sensible file name (`name-edited.webp`)
- [ ] Option to strip EXIF metadata (on by default, since canvas re-encoding removes it)

**Acceptance criteria**
- Moving the quality slider updates the preview and the size readout within about 300 ms on a 5 MB photo, with no UI freeze
- All tabs combine correctly in a single export
- The exported file matches the chosen format, dimensions, and quality

## Phase 3: Image batch mode

- [ ] Accept multiple files in the drop zone and "add more" afterwards
- [ ] Filmstrip of thumbnails at the bottom; each shows original size, new size, and status
- [ ] Selecting a thumbnail shows it in the main preview with live editing
- [ ] Settings apply to all images; crop is relative (ratio based) so it works across sizes
- [ ] Processing queue in the worker with limited concurrency (2 to 4 jobs) and overall progress
- [ ] Only the selected image is processed live; the rest are processed on export
- [ ] "Download all (.zip)" using `fflate`, showing total savings
- [ ] Remove individual images; clear all
- [ ] Memory handling: close bitmaps and revoke URLs for items that are not visible

**Acceptance criteria**
- 50 images of about 4 MB each process and download as a zip without crashing the tab
- **Milestone: first public launch, images only**

## Phase 4: PDF

- [ ] `pdf.worker.ts` with `pdf-lib`; thumbnails rendered with `pdfjs-dist`
- [ ] Page grid with drag to reorder, rotate, and delete
- [ ] Merge several PDFs
- [ ] Split by range or into single pages
- [ ] Images to PDF and PDF to images (zip)
- [ ] Add a text or image watermark and page numbers
- [ ] Draw or upload a signature and place it on a page
- [ ] Compress by re-encoding embedded images

**Acceptance criteria**
- A 100-page PDF loads thumbnails progressively and can be reordered and exported

## Phase 5: Audio

- [ ] Waveform with `wavesurfer.js` and draggable trim region
- [ ] Playback controls
- [ ] Trim, volume, fade in/out, and speed using Web Audio API (`OfflineAudioContext`)
- [ ] Normalize volume
- [ ] Merge several clips
- [ ] Convert format (MP3, WAV, OGG, M4A) with `@ffmpeg/ffmpeg`, lazy loaded, with a loading indicator
- [ ] Bitrate selector with estimated output size
- [ ] Voice recorder with `MediaRecorder`

**Acceptance criteria**
- A 10-minute MP3 can be trimmed, faded, and exported to another format with a progress bar

## Phase 6: Video

- [ ] Player plus timeline with thumbnails and trim handles
- [ ] Trim and cut
- [ ] Compress: resolution and quality controls with estimated output size
- [ ] Convert between MP4 and WebM; video to GIF
- [ ] Extract audio; remove audio
- [ ] Crop to ratio presets (9:16, 1:1, 16:9)
- [ ] Watermark (text or logo)
- [ ] Capture the current frame as an image
- [ ] Screen and webcam recorder (`getDisplayMedia`, `getUserMedia`, `MediaRecorder`)
- [ ] Use WebCodecs when supported; fall back to ffmpeg.wasm otherwise
- [ ] Add COOP and COEP headers in `vercel.json` **only** for `/audio/*` and `/video/*` routes
- [ ] File size limit with a clear warning for large videos

**Acceptance criteria**
- A 1-minute 1080p clip can be trimmed and compressed with visible progress and a cancel button

## Phase 7: Text, Developer, and Privacy tools

Build the `TwoPaneTool` template first, then each tool on top of it.

**Text**
- [ ] Word and character counter
- [ ] Case converter
- [ ] Text diff
- [ ] Markdown previewer
- [ ] OCR from an image (`tesseract.js`, lazy loaded)
- [ ] Text to speech (`speechSynthesis`)

**Developer**
- [ ] JSON formatter and validator
- [ ] Base64, URL, and JWT encode/decode
- [ ] Hash generator (SHA-1, SHA-256, SHA-512) and UUID generator
- [ ] Color converter (HEX, RGB, HSL) and palette generator
- [ ] Regex tester
- [ ] CSV, JSON, and Excel converter

**Privacy**
- [ ] Password generator (`crypto.getRandomValues`)
- [ ] File encrypt and decrypt with a password (AES-GCM, PBKDF2 key derivation)
- [ ] QR code generator and scanner
- [ ] Zip and unzip
- [ ] Favicon and app-icon generator

**Acceptance criteria**
- Every tool in the registry has a working page; no placeholders remain

## Phase 8: Polish and launch

- [ ] SEO: unique title, description, and Open Graph image per tool, generated from the registry; `sitemap.xml` and `robots.txt`
- [ ] Short "how it works" and FAQ content on each tool page
- [ ] PWA: manifest, service worker, offline support
- [ ] i18n with next-intl: English and Spanish
- [ ] Performance pass: check bundle sizes, confirm heavy libraries are lazy loaded, Lighthouse score above 90 on tool pages
- [ ] Error boundaries and a friendly message for unsupported browsers
- [ ] Privacy-friendly analytics (page views only, never file data)
- [ ] Cross-browser test: Chrome, Safari, Firefox, and mobile Safari and Chrome
- [ ] Deploy to Vercel with a custom domain

**Acceptance criteria**
- The site installs as a PWA and the image tools work offline
- Lighthouse performance, accessibility, and SEO are all above 90

---

## Known risks

| Risk | Mitigation |
|---|---|
| ffmpeg.wasm is about 30 MB | Lazy load, cache with the service worker, show a loading state |
| Multithreaded ffmpeg needs COOP/COEP headers | Scope the headers to audio and video routes only |
| Memory limits with large files or big batches | Per-tool size limits, limited concurrency, release bitmaps and URLs |
| AVIF encoding is not available in every browser's canvas | Use the jSquash WASM codec |
| WebCodecs support varies | Feature detect and fall back to ffmpeg.wasm |
| Safari differences in `OffscreenCanvas` and `MediaRecorder` | Test early in phase 2 and phase 5; add fallbacks to main-thread canvas |
