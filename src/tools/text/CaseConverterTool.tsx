"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { TwoPaneTool } from "@/components/shell/TwoPaneTool";
import { Segmented } from "@/components/shell/Segmented";
import { CASE_MODES, convertCase, type CaseMode } from "./lib/caseConvert";

export default function CaseConverterTool() {
  const t = useTranslations("text.case");
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<CaseMode>("title");
  const output = useMemo(() => convertCase(input, mode), [input, mode]);

  return (
    <TwoPaneTool
      input={input}
      onInputChange={setInput}
      inputPlaceholder={t("placeholder")}
      sample="the quick brown fox jumps over the lazy dog"
      mono={false}
      output={output}
      downloadName="converted.txt"
      options={
        <div className="flex w-full flex-col gap-1.5">
          <span className="text-xs font-medium text-fg-muted">{t("mode")}</span>
          <div className="scrollbar-thin -mx-1 overflow-x-auto px-1 pb-1">
            <Segmented
              label={t("mode")}
              value={mode}
              onChange={setMode}
              size="sm"
              className="w-max min-w-full"
              options={CASE_MODES.map((m) => ({ value: m, label: t(m) }))}
            />
          </div>
        </div>
      }
    />
  );
}
