"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";
import { TwoPaneTool, CopyButton, OptionCheckbox } from "@/components/shell/TwoPaneTool";
import { bytesToHex } from "./lib/encoding";
import { formatBytes } from "@/lib/formatBytes";
import { cryptoWorker, proxy } from "@/tools/privacy/lib/cryptoClient";
import { cn } from "@/lib/utils";

const ALGOS = ["SHA-1", "SHA-256", "SHA-512"] as const;
type Algo = (typeof ALGOS)[number];
const EMPTY: Record<Algo, string> = { "SHA-1": "", "SHA-256": "", "SHA-512": "" };

export default function HashTool() {
  const t = useTranslations("dev.hash");
  const [input, setInput] = useState("");
  const [upper, setUpper] = useState(false);
  const [compare, setCompare] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [hashes, setHashes] = useState<Record<Algo, string>>({ "SHA-1": "", "SHA-256": "", "SHA-512": "" });
  const [progress, setProgress] = useState<number | null>(null);

  // Text hashing is cheap: run it on the main thread whenever the input changes.
  useEffect(() => {
    if (file || !input) return;
    let cancelled = false;
    const data = new TextEncoder().encode(input);
    Promise.all(ALGOS.map((a) => crypto.subtle.digest(a, data).then(bytesToHex))).then(([a, b, c]) => {
      if (!cancelled) setHashes({ "SHA-1": a, "SHA-256": b, "SHA-512": c });
    });
    return () => {
      cancelled = true;
    };
  }, [input, file]);

  const onFile = async (f: File) => {
    setFile(f);
    setInput(t("fileHashed", { name: f.name, size: formatBytes(f.size) }));
    setProgress(0);
    const w = cryptoWorker();
    const out: Record<Algo, string> = { "SHA-1": "", "SHA-256": "", "SHA-512": "" };
    for (const a of ALGOS) {
      out[a] = await w.hashFile(f, a, proxy((done: number) => setProgress(Math.round((done / f.size) * 100))));
    }
    setHashes({ ...out });
    setProgress(null);
  };

  const shown = input || file ? hashes : EMPTY;
  const fmt = (h: string) => (upper ? h.toUpperCase() : h);
  const all = useMemo(() => ALGOS.filter((a) => shown[a]).map((a) => `${a}: ${upper ? shown[a].toUpperCase() : shown[a]}`).join("\n"), [shown, upper]);
  const cmp = compare.trim().toLowerCase();
  const matchAlgo = cmp ? ALGOS.find((a) => shown[a] && shown[a] === cmp) : undefined;

  return (
    <TwoPaneTool
      input={input}
      onInputChange={(v) => {
        setFile(null);
        setInput(v);
      }}
      inputPlaceholder={t("placeholder")}
      sample="The quick brown fox jumps over the lazy dog"
      accept={["*/*"]}
      onFile={onFile}
      outputText={all}
      mono
      options={<OptionCheckbox label={t("uppercase")} checked={upper} onChange={setUpper} />}
      output={
        <div className="scrollbar-thin flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          {progress !== null && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-fg-muted">{file ? t("hashing", { name: file.name }) : ""}</span>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
          {ALGOS.map((a) => (
            <div key={a} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">{a}</span>
                <CopyButton text={fmt(shown[a])} className="h-7" />
              </div>
              <code className={cn("block rounded-sm border bg-surface-2 p-3 font-mono text-xs break-all text-fg", matchAlgo === a ? "border-primary" : "border-border")}>
                {shown[a] ? fmt(shown[a]) : "—"}
              </code>
            </div>
          ))}
          <label className="flex flex-col gap-1.5 text-xs text-fg-muted">
            <span className="font-medium">{t("compare")}</span>
            <input
              value={compare}
              onChange={(e) => setCompare(e.target.value)}
              placeholder={t("comparePlaceholder")}
              className="h-9 rounded-sm border border-border bg-surface-2 px-3 font-mono text-xs text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            />
          </label>
          {cmp && (
            <span className={cn("flex items-center gap-1.5 text-xs font-medium", matchAlgo ? "text-primary" : "text-danger")}>
              {matchAlgo ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}
              {matchAlgo ? `${t("match")} · ${matchAlgo}` : t("mismatch")}
            </span>
          )}
        </div>
      }
    />
  );
}
