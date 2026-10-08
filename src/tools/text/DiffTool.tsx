"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { diffChars, diffLines, diffWords, type Change } from "diff";
import { Pane, ToolHeader, textareaClass, CopyButton, NativeSelect, OptionCheckbox } from "@/components/shell/TwoPaneTool";
import { cn } from "@/lib/utils";

type Mode = "lines" | "words" | "chars";

export default function DiffTool() {
  const t = useTranslations("text.diff");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [mode, setMode] = useState<Mode>("lines");
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [ignoreWs, setIgnoreWs] = useState(false);

  const changes = useMemo<Change[]>(() => {
    if (!a && !b) return [];
    const opts = { ignoreCase };
    if (mode === "lines") return diffLines(a, b, { ...opts, ignoreWhitespace: ignoreWs });
    if (mode === "words") return diffWords(a, b, opts);
    return diffChars(a, b, opts);
  }, [a, b, mode, ignoreCase, ignoreWs]);

  const added = changes.filter((c) => c.added).reduce((n, c) => n + (c.count ?? 0), 0);
  const removed = changes.filter((c) => c.removed).reduce((n, c) => n + (c.count ?? 0), 0);
  const identical = Boolean(a || b) && added === 0 && removed === 0;
  const unified = changes.map((c) => (c.added ? `+${c.value}` : c.removed ? `-${c.value}` : ` ${c.value}`)).join(mode === "lines" ? "" : "\n");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6">
        <ToolHeader />
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect
            label={t("mode")}
            value={mode}
            onChange={setMode}
            options={[
              { value: "lines", label: t("lines") },
              { value: "words", label: t("words") },
              { value: "chars", label: t("chars") },
            ]}
          />
          <OptionCheckbox label={t("ignoreCase")} checked={ignoreCase} onChange={setIgnoreCase} />
          <OptionCheckbox label={t("ignoreWhitespace")} checked={ignoreWs} onChange={setIgnoreWs} />
        </div>
      </div>
      <div className="grid min-h-0 flex-1 gap-3 p-4 md:grid-cols-2 md:grid-rows-[minmax(160px,1fr)_minmax(200px,1.2fr)] md:p-6">
        <Pane title={t("original")} className="min-h-[160px]">
          <textarea value={a} onChange={(e) => setA(e.target.value)} placeholder={t("placeholderA")} spellCheck={false} aria-label={t("original")} className={cn(textareaClass, "font-mono")} />
        </Pane>
        <Pane title={t("changed")} className="min-h-[160px]">
          <textarea value={b} onChange={(e) => setB(e.target.value)} placeholder={t("placeholderB")} spellCheck={false} aria-label={t("changed")} className={cn(textareaClass, "font-mono")} />
        </Pane>
        <Pane
          title={t("result")}
          className="min-h-[240px] md:col-span-2"
          meta={
            changes.length > 0 && (
              <span className="flex gap-2">
                <span className="text-primary">{t("added", { count: added })}</span>
                <span className="text-danger">{t("removed", { count: removed })}</span>
              </span>
            )
          }
          actions={<CopyButton text={unified} />}
        >
          <div className="scrollbar-thin flex-1 overflow-auto p-3.5 font-mono text-[13px] leading-relaxed whitespace-pre-wrap">
            {identical && <p className="text-fg-muted">{t("identical")}</p>}
            {changes.map((c, i) => (
              <span
                key={i}
                className={cn(
                  c.added && "rounded-xs bg-primary-soft text-primary",
                  c.removed && "rounded-xs bg-danger-soft text-danger line-through decoration-danger/50",
                  !c.added && !c.removed && "text-fg-muted",
                  mode === "lines" && (c.added || c.removed) && "block",
                )}
              >
                {c.value}
              </span>
            ))}
          </div>
        </Pane>
      </div>
    </div>
  );
}
