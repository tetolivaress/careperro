export type CaseMode =
  | "upper"
  | "lower"
  | "title"
  | "sentence"
  | "camel"
  | "pascal"
  | "snake"
  | "kebab"
  | "constant"
  | "alternating"
  | "inverse";

export const CASE_MODES: CaseMode[] = ["upper", "lower", "title", "sentence", "camel", "pascal", "snake", "kebab", "constant", "alternating", "inverse"];

const SMALL = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "nor", "of", "on", "or", "the", "to", "up", "de", "la", "el", "y", "o", "en", "del", "los", "las"]);

function words(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function lineWise(text: string, fn: (line: string) => string): string {
  return text.split(/\r?\n/).map(fn).join("\n");
}

export function convertCase(text: string, mode: CaseMode): string {
  switch (mode) {
    case "upper":
      return text.toLocaleUpperCase();
    case "lower":
      return text.toLocaleLowerCase();
    case "title":
      return lineWise(text, (line) =>
        line
          .toLocaleLowerCase()
          .split(/(\s+)/)
          .map((w, i, arr) => {
            if (/^\s+$/.test(w) || !w) return w;
            const isEdge = i === 0 || i === arr.length - 1;
            if (!isEdge && SMALL.has(w)) return w;
            return w.charAt(0).toLocaleUpperCase() + w.slice(1);
          })
          .join(""),
      );
    case "sentence":
      return text.toLocaleLowerCase().replace(/(^\s*\p{L}|[.!?]\s+\p{L})/gu, (m) => m.toLocaleUpperCase());
    case "camel":
      return lineWise(text, (line) => words(line).map((w, i) => (i === 0 ? w.toLocaleLowerCase() : w.charAt(0).toLocaleUpperCase() + w.slice(1).toLocaleLowerCase())).join(""));
    case "pascal":
      return lineWise(text, (line) => words(line).map((w) => w.charAt(0).toLocaleUpperCase() + w.slice(1).toLocaleLowerCase()).join(""));
    case "snake":
      return lineWise(text, (line) => words(line).map((w) => w.toLocaleLowerCase()).join("_"));
    case "kebab":
      return lineWise(text, (line) => words(line).map((w) => w.toLocaleLowerCase()).join("-"));
    case "constant":
      return lineWise(text, (line) => words(line).map((w) => w.toLocaleUpperCase()).join("_"));
    case "alternating":
      return Array.from(text).map((ch, i) => (i % 2 ? ch.toLocaleUpperCase() : ch.toLocaleLowerCase())).join("");
    case "inverse":
      return Array.from(text).map((ch) => (ch === ch.toLocaleUpperCase() ? ch.toLocaleLowerCase() : ch.toLocaleUpperCase())).join("");
  }
}
