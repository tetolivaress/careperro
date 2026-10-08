"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ToolHeader, Pane, CopyButton, textareaClass } from "@/components/shell/TwoPaneTool";
import { cn } from "@/lib/utils";

const FLAGS = ["g", "i", "m", "s", "u", "y"] as const;

interface MatchInfo {
  index: number;
  match: string;
  groups: string[];
  named: Record<string, string>;
}

export default function RegexTool() {
  const t = useTranslations("dev.regex");
  const [pattern, setPattern] = useState("(\\w+)@(\\w+)\\.com");
  const [flags, setFlags] = useState("g");
  const [text, setText] = useState("Contact ana@caribito.com or luis@example.com today.");
  const [replacement, setReplacement] = useState("$1 at $2");

  const compiled = useMemo(() => {
    if (!pattern) return { re: null as RegExp | null, error: null as string | null };
    try {
      return { re: new RegExp(pattern, flags.includes("g") ? flags : flags + "g"), error: null };
    } catch (e) {
      return { re: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [pattern, flags]);

  const matches = useMemo<MatchInfo[]>(() => {
    if (!compiled.re || !text) return [];
    const out: MatchInfo[] = [];
    for (const m of text.matchAll(compiled.re)) {
      out.push({ index: m.index ?? 0, match: m[0], groups: m.slice(1).map((g) => g ?? ""), named: { ...(m.groups ?? {}) } });
      if (out.length > 2000) break;
    }
    return out;
  }, [compiled.re, text]);

  const highlighted = useMemo<ReactNode[]>(() => {
    if (!matches.length) return [text];
    const nodes: ReactNode[] = [];
    let pos = 0;
    matches.forEach((m, i) => {
      if (m.index > pos) nodes.push(text.slice(pos, m.index));
      nodes.push(
        <mark key={i} className="rounded-xs bg-primary-soft text-primary ring-1 ring-primary-line">
          {m.match || "​"}
        </mark>,
      );
      pos = m.index + m.match.length;
    });
    if (pos < text.length) nodes.push(text.slice(pos));
    return nodes;
  }, [matches, text]);

  const replaced = useMemo(() => {
    if (!compiled.re) return "";
    try {
      return text.replace(new RegExp(pattern, flags.includes("g") ? flags : flags + "g"), replacement);
    } catch {
      return "";
    }
  }, [compiled.re, text, pattern, flags, replacement]);

  const toggleFlag = (f: string) => setFlags((cur) => (cur.includes(f) ? cur.replace(f, "") : cur + f));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-3 border-b border-border px-4 py-3 md:px-6">
        <ToolHeader />
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <label className="flex flex-1 items-center gap-2 font-mono text-sm">
            <span className="text-fg-subtle">/</span>
            <input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder={t("patternPlaceholder")}
              aria-label={t("pattern")}
              aria-invalid={Boolean(compiled.error)}
              spellCheck={false}
              className={cn("h-10 flex-1 rounded-sm border bg-surface-2 px-3 font-mono text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring/60", compiled.error ? "border-danger" : "border-border")}
            />
            <span className="text-fg-subtle">/{flags}</span>
          </label>
          <div className="flex items-center gap-1" role="group" aria-label={t("flags")}>
            {FLAGS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => toggleFlag(f)}
                aria-pressed={flags.includes(f)}
                title={t(`flagHelp.${f}`)}
                className={cn("size-8 rounded-sm border font-mono text-xs font-semibold", flags.includes(f) ? "border-primary-line bg-primary-soft text-primary" : "border-border bg-surface-2 text-fg-muted hover:text-fg")}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        {compiled.error && (
          <p role="alert" className="text-xs text-danger">
            {t("invalid")}: {compiled.error}
          </p>
        )}
      </div>
      <div className="grid min-h-0 flex-1 gap-3 p-4 md:grid-cols-2 md:p-6">
        <Pane title={t("test")} meta={t("matches", { count: matches.length })} className="min-h-[200px]">
          <div className="relative flex min-h-0 flex-1">
            <div aria-hidden className="scrollbar-thin pointer-events-none absolute inset-0 overflow-auto p-3.5 font-mono text-[13px] leading-relaxed break-words whitespace-pre-wrap text-transparent">
              {highlighted}
            </div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t("placeholder")} spellCheck={false} aria-label={t("test")} className={cn(textareaClass, "relative bg-transparent font-mono break-words whitespace-pre-wrap")} />
          </div>
        </Pane>
        <div className="flex min-h-0 flex-col gap-3">
          <Pane title={t("groups")} className="min-h-[160px] flex-1">
            <ul className="scrollbar-thin flex-1 divide-y divide-border overflow-auto">
              {matches.length === 0 && <li className="p-4 text-sm text-fg-subtle">{t("matches", { count: 0 })}</li>}
              {matches.slice(0, 200).map((m, i) => (
                <li key={i} className="flex flex-col gap-1 px-3.5 py-2.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="rounded-xs bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-fg-subtle">{t("index", { index: m.index })}</span>
                    <code className="font-mono text-fg">{m.match}</code>
                  </div>
                  {m.groups.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 ps-1">
                      {m.groups.map((g, gi) => (
                        <span key={gi} className="rounded-xs bg-primary-soft px-1.5 py-0.5 font-mono text-[11px] text-primary">
                          ${gi + 1}: {g}
                        </span>
                      ))}
                      {Object.entries(m.named).map(([k, v]) => (
                        <span key={k} className="rounded-xs bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-code-literal">
                          {k}: {v}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Pane>
          <Pane title={t("result")} className="min-h-[140px] flex-1" actions={<CopyButton text={replaced} />}>
            <input
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
              placeholder={t("replacePlaceholder")}
              aria-label={t("replace")}
              className="h-9 shrink-0 border-b border-border bg-transparent px-3.5 font-mono text-xs text-fg outline-none"
            />
            <textarea readOnly value={replaced} aria-label={t("result")} className={cn(textareaClass, "font-mono")} />
          </Pane>
        </div>
      </div>
    </div>
  );
}
