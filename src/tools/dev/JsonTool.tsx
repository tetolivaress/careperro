"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, TriangleAlert } from "lucide-react";
import { TwoPaneTool, NativeSelect, OptionCheckbox } from "@/components/shell/TwoPaneTool";
import { formatBytes } from "@/lib/formatBytes";

const SAMPLE = `{"name":"Lokal","private":true,"tools":["compress","resize","merge"],"stats":{"uploads":0,"files":128},"nested":{"deep":{"deeper":{"value":42}}}}`;

type Indent = "2" | "4" | "tab";

function sortKeysDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.keys(v as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeysDeep((v as Record<string, unknown>)[k])]),
    );
  }
  return v;
}

function stats(v: unknown): { keys: number; depth: number } {
  let keys = 0;
  let depth = 0;
  const walk = (x: unknown, d: number) => {
    depth = Math.max(depth, d);
    if (Array.isArray(x)) x.forEach((i) => walk(i, d + 1));
    else if (x && typeof x === "object") {
      for (const [, val] of Object.entries(x as Record<string, unknown>)) {
        keys++;
        walk(val, d + 1);
      }
    }
  };
  walk(v, 0);
  return { keys, depth };
}

/** Pulls "position N" out of a SyntaxError message and converts it to a line number. */
function errorLine(message: string, source: string): number | null {
  const m = message.match(/position (\d+)/);
  if (!m) {
    const l = message.match(/line (\d+)/);
    return l ? Number(l[1]) : null;
  }
  const pos = Number(m[1]);
  return source.slice(0, pos).split("\n").length;
}

export default function JsonTool() {
  const t = useTranslations("dev.json");
  const [input, setInput] = useState("");
  const [indent, setIndent] = useState<Indent>("2");
  const [minify, setMinify] = useState(false);
  const [sortKeys, setSortKeys] = useState(false);

  const result = useMemo(() => {
    if (!input.trim()) return { output: "", error: null as string | null, line: null as number | null, meta: null as { keys: number; depth: number } | null };
    try {
      const parsed = JSON.parse(input) as unknown;
      const value = sortKeys ? sortKeysDeep(parsed) : parsed;
      const space = minify ? undefined : indent === "tab" ? "\t" : Number(indent);
      return { output: JSON.stringify(value, null, space), error: null, line: null, meta: stats(parsed) };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { output: "", error: msg, line: errorLine(msg, input), meta: null };
    }
  }, [input, indent, minify, sortKeys]);

  return (
    <TwoPaneTool
      input={input}
      onInputChange={setInput}
      inputPlaceholder={t("placeholder")}
      sample={SAMPLE}
      accept={[".json", "application/json", ".txt"]}
      output={result.output}
      error={result.error ? `${t("invalid")}${result.line ? ` · ${t("line", { line: result.line })}` : ""}\n${result.error}` : null}
      downloadName="formatted.json"
      downloadMime="application/json"
      options={
        <>
          <NativeSelect
            label={t("indent")}
            value={indent}
            onChange={setIndent}
            options={[
              { value: "2", label: t("spaces", { count: 2 }) },
              { value: "4", label: t("spaces", { count: 4 }) },
              { value: "tab", label: t("tabs") },
            ]}
          />
          <OptionCheckbox label={t("minify")} checked={minify} onChange={setMinify} />
          <OptionCheckbox label={t("sortKeys")} checked={sortKeys} onChange={setSortKeys} />
        </>
      }
      status={
        input.trim() ? (
          result.error ? (
            <span className="flex items-center gap-1.5 text-danger">
              <TriangleAlert className="size-4" aria-hidden /> {t("invalid")}
              {result.line ? ` · ${t("line", { line: result.line })}` : ""}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-primary">
              <Check className="size-4" aria-hidden /> {t("valid")}
              <span className="text-fg-subtle">
                · {result.meta ? t("stats", result.meta) : ""} · {formatBytes(new TextEncoder().encode(result.output).length)}
              </span>
            </span>
          )
        ) : null
      }
    />
  );
}
