export interface TextStats {
  characters: number;
  charactersNoSpaces: number;
  words: number;
  sentences: number;
  paragraphs: number;
  lines: number;
  readingMinutes: number;
  speakingMinutes: number;
  bytes: number;
  topWords: { word: string; count: number }[];
}

const STOP = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "is", "it", "that", "for", "on", "with", "as", "de", "la", "el", "y", "en", "que", "los", "las", "un", "una", "es", "por", "con"]);

export function textStats(text: string): TextStats {
  const trimmed = text.trim();
  const wordList = trimmed ? trimmed.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)) : [];
  const sentences = trimmed ? (trimmed.match(/[^.!?…]+[.!?…]+(\s|$)|[^.!?…]+$/g) ?? []).filter((s) => s.trim()).length : 0;
  const paragraphs = trimmed ? trimmed.split(/\n\s*\n/).filter((p) => p.trim()).length : 0;
  const counts = new Map<string, number>();
  for (const w of wordList) {
    const k = w.toLocaleLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (k.length < 2 || STOP.has(k)) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const topWords = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([word, count]) => ({ word, count }));
  return {
    characters: Array.from(text).length,
    charactersNoSpaces: Array.from(text.replace(/\s/g, "")).length,
    words: wordList.length,
    sentences,
    paragraphs,
    lines: text ? text.split(/\r?\n/).length : 0,
    readingMinutes: wordList.length / 225,
    speakingMinutes: wordList.length / 150,
    bytes: new TextEncoder().encode(text).length,
    topWords,
  };
}
