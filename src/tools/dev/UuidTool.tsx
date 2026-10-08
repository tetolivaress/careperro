"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { TwoPaneTool, NativeSelect, primaryButton } from "@/components/shell/TwoPaneTool";

type Format = "standard" | "uppercase" | "noDashes" | "braces";

function make(count: number, format: Format): string {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    let u = crypto.randomUUID();
    if (format === "uppercase") u = u.toUpperCase();
    if (format === "noDashes") u = u.replace(/-/g, "");
    if (format === "braces") u = `{${u}}`;
    out.push(u);
  }
  return out.join("\n");
}

export default function UuidTool() {
  const t = useTranslations("dev.uuid");
  const [count, setCount] = useState(5);
  const [format, setFormat] = useState<Format>("standard");
  const [output, setOutput] = useState(() => make(5, "standard"));

  const regen = (c = count, f = format) => setOutput(make(c, f));

  return (
    <TwoPaneTool
      hideInput
      input=""
      onInputChange={() => {}}
      output={output}
      downloadName="uuids.txt"
      outputMeta={t("generated", { count: output.split("\n").filter(Boolean).length })}
      options={
        <>
          <label className="flex items-center gap-2 text-xs font-medium text-fg-muted">
            {t("count")}
            <input
              type="number"
              min={1}
              max={1000}
              value={count}
              onChange={(e) => {
                const c = Math.max(1, Math.min(1000, Number(e.target.value) || 1));
                setCount(c);
                regen(c, format);
              }}
              className="h-8 w-20 rounded-sm border border-border bg-surface-2 px-2 text-xs text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            />
          </label>
          <NativeSelect
            label={t("format")}
            value={format}
            onChange={(f) => {
              setFormat(f);
              regen(count, f);
            }}
            options={[
              { value: "standard", label: t("standard") },
              { value: "uppercase", label: t("uppercase") },
              { value: "noDashes", label: t("noDashes") },
              { value: "braces", label: t("braces") },
            ]}
          />
          <button type="button" onClick={() => regen()} className={`${primaryButton} h-8 px-3 text-xs`}>
            <RefreshCw className="size-3.5" aria-hidden />
            {t("generate")}
          </button>
        </>
      }
    />
  );
}
