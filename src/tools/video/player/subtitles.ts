/** SubRip (.srt) and WebVTT (.vtt) parsing for the video player. Both formats share the "start --> end" cue line. */

export interface Cue {
  start: number;
  end: number;
  text: string;
}

export interface SubtitleTrack {
  name: string;
  /** Localized language name guessed from the file name ("clip.en.vtt"), if any. */
  language: string | null;
  cues: Cue[];
  /** Seconds added to every cue; positive shows subtitles later. */
  offset: number;
}

const TIME = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;

function parseTime(value: string): number | null {
  const m = TIME.exec(value);
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, "0")) / 1000;
}

function cleanText(lines: string[]): string {
  return lines
    .join("\n")
    .replace(/\{\\[^}]*\}/g, "") // ASS overrides such as {\an8}
    .replace(/<[^>]*>/g, "") // <i>, <c.class>, <00:00:01.000>
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

export function parseSubtitles(source: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = source
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split("\n");
    const at = lines.findIndex((l) => l.includes("-->"));
    if (at < 0) continue; // WEBVTT header, NOTE and STYLE blocks
    const [from, to] = lines[at].split("-->");
    const start = parseTime(from);
    const end = parseTime(to ?? "");
    if (start === null || end === null || end <= start) continue;
    const text = cleanText(lines.slice(at + 1));
    if (text) cues.push({ start, end, text });
  }
  return cues.sort((a, b) => a.start - b.start);
}

function languageFrom(fileName: string, locale: string): string | null {
  const code = /\.([a-z]{2,3}(?:-[a-z]{2,4})?)\.(?:srt|vtt)$/i.exec(fileName)?.[1];
  if (!code) return null;
  try {
    const name = new Intl.DisplayNames([locale], { type: "language" }).of(code);
    if (!name || name.toLowerCase() === code.toLowerCase()) return null;
    return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
  } catch {
    return null;
  }
}

/** Reads a subtitle file. Old .srt files are often Windows-1252, so that is the fallback when UTF-8 fails. */
export async function readSubtitleFile(file: File, locale: string): Promise<SubtitleTrack> {
  const buffer = await file.arrayBuffer();
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    text = new TextDecoder("windows-1252").decode(buffer);
  }
  return { name: file.name, language: languageFrom(file.name, locale), cues: parseSubtitles(text), offset: 0 };
}

/** Text to show at `time`, or null. Overlapping cues are stacked. */
export function activeCueText(track: SubtitleTrack, time: number): string | null {
  const t = time - track.offset;
  let out: string | null = null;
  for (const cue of track.cues) {
    if (cue.start > t) break;
    if (cue.end > t) out = out ? `${out}\n${cue.text}` : cue.text;
  }
  return out;
}

export function isSubtitleFile(file: File): boolean {
  return /\.(srt|vtt)$/i.test(file.name);
}
