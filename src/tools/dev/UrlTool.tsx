"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { TwoPaneTool, NativeSelect } from "@/components/shell/TwoPaneTool";
import { Segmented } from "@/components/shell/Segmented";

type Mode = "encode" | "decode";
type Scope = "component" | "full";

function parseUrl(s: string): { parts: [string, string][]; params: [string, string][] } | null {
  try {
    const u = new URL(s);
    const parts: [string, string][] = [
      ["protocol", u.protocol],
      ["host", u.host],
      ["pathname", u.pathname],
      ["search", u.search],
      ["hash", u.hash],
    ].filter(([, v]) => v) as [string, string][];
    return { parts, params: [...u.searchParams.entries()] };
  } catch {
    return null;
  }
}

export default function UrlTool() {
  const t = useTranslations("dev.url");
  const [mode, setMode] = useState<Mode>("encode");
  const [scope, setScope] = useState<Scope>("component");
  const [input, setInput] = useState("");

  const result = useMemo(() => {
    if (!input) return { output: "", error: null as string | null };
    try {
      if (mode === "encode") return { output: scope === "component" ? encodeURIComponent(input) : encodeURI(input), error: null };
      return { output: scope === "component" ? decodeURIComponent(input.replace(/\+/g, " ")) : decodeURI(input), error: null };
    } catch {
      return { output: "", error: t("invalid") };
    }
  }, [input, mode, scope, t]);

  const parsed = useMemo(() => parseUrl(mode === "decode" ? result.output : input), [input, mode, result.output]);

  return (
    <TwoPaneTool
      input={input}
      onInputChange={setInput}
      inputPlaceholder={mode === "encode" ? t("placeholderEncode") : t("placeholderDecode")}
      sample={mode === "encode" ? "https://caribito.com/search?q=ñandú & café#top" : "https%3A%2F%2Fcaribito.com%2Fsearch%3Fq%3D%C3%B1and%C3%BA%20%26%20caf%C3%A9"}
      output={result.output}
      error={result.error}
      options={
        <>
          <Segmented
            label={t("encode")}
            size="sm"
            className="w-auto"
            value={mode}
            onChange={setMode}
            options={[
              { value: "encode", label: t("encode") },
              { value: "decode", label: t("decode") },
            ]}
          />
          <NativeSelect
            label=""
            value={scope}
            onChange={setScope}
            options={[
              { value: "component", label: t("component") },
              { value: "full", label: t("full") },
            ]}
          />
        </>
      }
      status={
        parsed && parsed.params.length > 0 ? (
          <span className="truncate text-fg-subtle">
            {t("params")}: {parsed.params.map(([k, v]) => `${k}=${v}`).join(" · ")}
          </span>
        ) : null
      }
    />
  );
}
