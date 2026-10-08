"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { TwoPaneTool } from "@/components/shell/TwoPaneTool";
import { formatBytes } from "@/lib/formatBytes";
import { textStats } from "./lib/textStats";

const SAMPLE = "The quick brown fox jumps over the lazy dog. It was a bright cold day in April, and the clocks were striking thirteen.\n\nA second paragraph keeps the counter honest.";

export default function WordCounterTool() {
  const t = useTranslations("text.counter");
  const [input, setInput] = useState("");
  const stats = useMemo(() => textStats(input), [input]);
  const minutes = (m: number) => t("minutes", { count: Math.ceil(m) });

  const rows: [string, string][] = [
    [t("characters"), stats.characters.toLocaleString()],
    [t("charactersNoSpaces"), stats.charactersNoSpaces.toLocaleString()],
    [t("words"), stats.words.toLocaleString()],
    [t("sentences"), stats.sentences.toLocaleString()],
    [t("paragraphs"), stats.paragraphs.toLocaleString()],
    [t("lines"), stats.lines.toLocaleString()],
    [t("bytes"), formatBytes(stats.bytes)],
    [t("reading"), minutes(stats.readingMinutes)],
    [t("speaking"), minutes(stats.speakingMinutes)],
  ];

  const outputText = rows.map(([k, v]) => `${k}: ${v}`).join("\n");

  return (
    <TwoPaneTool
      input={input}
      onInputChange={setInput}
      inputPlaceholder={t("placeholder")}
      sample={SAMPLE}
      accept={[".txt", ".md", "text/plain", "text/markdown"]}
      mono={false}
      outputText={outputText}
      outputMeta={t("summary", { words: stats.words, characters: stats.characters })}
      output={
        <div className="scrollbar-thin flex flex-1 flex-col gap-5 overflow-y-auto p-4">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {rows.map(([k, v]) => (
              <div key={k} className="flex flex-col gap-0.5 rounded-sm border border-border bg-surface-2 p-3">
                <dd className="text-xl font-bold text-fg tabular-nums">{v}</dd>
                <dt className="text-xs text-fg-muted">{k}</dt>
              </div>
            ))}
          </dl>
          {stats.topWords.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">{t("topWords")}</span>
              <ul className="flex flex-wrap gap-1.5">
                {stats.topWords.map((w) => (
                  <li key={w.word} className="flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs text-fg">
                    {w.word}
                    <span className="text-fg-subtle tabular-nums">{w.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      }
    />
  );
}
