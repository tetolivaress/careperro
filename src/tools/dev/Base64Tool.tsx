"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { TwoPaneTool, OptionCheckbox } from "@/components/shell/TwoPaneTool";
import { Segmented } from "@/components/shell/Segmented";
import { base64Decode, base64Encode, bytesToBase64 } from "./lib/encoding";
import { formatBytes } from "@/lib/formatBytes";

type Mode = "encode" | "decode";

export default function Base64Tool() {
  const t = useTranslations("dev.base64");
  const [mode, setMode] = useState<Mode>("encode");
  const [input, setInput] = useState("");
  const [urlSafe, setUrlSafe] = useState(false);
  const [dataUri, setDataUri] = useState(false);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number; mime: string; b64: string } | null>(null);

  const result = useMemo(() => {
    if (fileInfo && mode === "encode") {
      return { output: dataUri ? `data:${fileInfo.mime || "application/octet-stream"};base64,${fileInfo.b64}` : fileInfo.b64, error: null as string | null };
    }
    if (!input) return { output: "", error: null };
    try {
      if (mode === "encode") {
        const b = base64Encode(input, urlSafe);
        return { output: dataUri ? `data:text/plain;charset=utf-8;base64,${b}` : b, error: null };
      }
      const stripped = input.replace(/^data:[^,]*,/, "");
      return { output: base64Decode(stripped), error: null };
    } catch {
      return { output: "", error: t("invalid") };
    }
  }, [input, mode, urlSafe, dataUri, fileInfo, t]);

  const onFile = async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    setFileInfo({ name: file.name, size: file.size, mime: file.type, b64: bytesToBase64(bytes, urlSafe) });
    setInput(t("fileEncoded", { name: file.name, size: formatBytes(file.size) }));
    setMode("encode");
  };

  return (
    <TwoPaneTool
      input={input}
      onInputChange={(v) => {
        setFileInfo(null);
        setInput(v);
      }}
      inputPlaceholder={mode === "encode" ? t("placeholderEncode") : t("placeholderDecode")}
      sample={mode === "encode" ? "Hello, Lokal! 🌴" : "SGVsbG8sIExva2FsISDwn4y0"}
      accept={["*/*"]}
      onFile={onFile}
      output={result.output}
      error={result.error}
      downloadName={mode === "encode" ? "encoded.txt" : "decoded.txt"}
      options={
        <>
          <Segmented
            label={t("encode")}
            size="sm"
            className="w-auto"
            value={mode}
            onChange={(m) => {
              setMode(m);
              setFileInfo(null);
            }}
            options={[
              { value: "encode", label: t("encode") },
              { value: "decode", label: t("decode") },
            ]}
          />
          {mode === "encode" && (
            <>
              <OptionCheckbox label={t("urlSafe")} checked={urlSafe} onChange={setUrlSafe} />
              <OptionCheckbox label={t("dataUri")} checked={dataUri} onChange={setDataUri} />
            </>
          )}
        </>
      }
      status={<span className="text-fg-subtle">{t("fileHint")}</span>}
    />
  );
}
