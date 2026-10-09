"use client";

import { heicToPngFile, isHeicFile } from "@/lib/heic";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, Image as ImageIcon, ScanText } from "lucide-react";
import { DropZone, ExportBar, ProcessingCard, SettingsGroup, ToolShell, type ProcessingStep } from "@/components/shell";
import { CopyButton, NativeSelect, textareaClass, toolButton } from "@/components/shell/TwoPaneTool";
import { downloadBlob, outputFileName } from "@/lib/download";
import { formatBytes } from "@/lib/formatBytes";
import { takeFiles } from "@/lib/fileHandoff";
import { useToolShellStore } from "@/stores/toolShell";
import { useSessionStore } from "@/stores/session";
import { useCurrentTool } from "@/tools/useCurrentTool";
import { useToolCopy } from "@/tools/copy";
import { cn } from "@/lib/utils";

const LANGS = ["eng", "spa", "fra", "deu", "por", "ita", "jpn", "chi_sim", "ara", "rus", "hin", "ind"] as const;
type Lang = (typeof LANGS)[number];

type Phase = "idle" | "loading" | "recognizing" | "done" | "error";

export default function OcrTool() {
  const t = useTranslations("text.ocr");
  const tool = useCurrentTool();
  const copy = useToolCopy();
  const [file, setFile] = useState<File | null>(() => takeFiles()?.[0] ?? null);
  const [lang, setLang] = useState<Lang>("eng");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [text, setText] = useState("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<{ cancelled: boolean } | null>(null);
  const setShellFile = useToolShellStore((s) => s.setFile);
  const recordProcessed = useSessionStore((s) => s.recordProcessed);

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    setShellFile(file ? { name: file.name, meta: formatBytes(file.size) } : null);
  }, [file, setShellFile]);

  // iPhone HEIC photos: swap in a lossless PNG so the preview and Tesseract can read them.
  useEffect(() => {
    if (!file || !isHeicFile(file)) return;
    let alive = true;
    heicToPngFile(file)
      .then((png) => {
        if (alive) setFile(png);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [file]);

  const run = useCallback(
    async (f: File, l: Lang) => {
      const token = { cancelled: false };
      cancelRef.current = token;
      setPhase("loading");
      setProgress(0);
      setError(null);
      try {
        const { createWorker } = await import("tesseract.js");
        const worker = await createWorker(l, 1, {
          logger: (m: { status: string; progress: number }) => {
            if (token.cancelled) return;
            if (m.status === "recognizing text") {
              setPhase("recognizing");
              setProgress(Math.round(m.progress * 100));
            } else if (m.status.includes("loading") || m.status.includes("initializ")) {
              setProgress(Math.round(m.progress * 100));
            }
          },
        });
        if (token.cancelled) {
          await worker.terminate();
          return;
        }
        const result = await worker.recognize(f);
        await worker.terminate();
        if (token.cancelled) return;
        setText(result.data.text.trim());
        setConfidence(Math.round(result.data.confidence));
        setPhase("done");
        recordProcessed();
      } catch (e) {
        if (token.cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setPhase("error");
      }
    },
    [recordProcessed],
  );

  const cancel = () => {
    if (cancelRef.current) cancelRef.current.cancelled = true;
    setPhase("idle");
  };

  const reset = () => {
    cancel();
    setFile(null);
    setText("");
    setConfidence(null);
  };

  if (!tool) return null;
  const c = copy(tool);

  if (!file) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-5 py-10 md:px-12">
        <div className="flex max-w-[640px] flex-col items-center gap-3 text-center">
          <ScanText className="size-10 text-fg" aria-hidden />
          <h1 className="text-2xl font-bold tracking-tight text-fg">{c.name}</h1>
          <p className="text-sm text-fg-muted">{c.description}</p>
        </div>
        <DropZone
          className="w-full max-w-[640px]"
          accept={tool.accept}
          maxSize={tool.maxSize}
          title={t("drop")}
          subtitle={t("dropSubtitle")}
          formats={["PNG", "JPG", "WebP", "HEIC"]}
          onFiles={(files) => {
            setFile(files[0]);
            setText("");
            setConfidence(null);
            setPhase("idle");
          }}
        />
        <p className="max-w-[640px] text-center text-xs text-fg-subtle">{t("firstRunNote")}</p>
      </div>
    );
  }

  const steps: ProcessingStep[] = [
    { label: t("steps.load"), state: phase === "loading" && progress < 50 ? "active" : "done" },
    { label: t("steps.language"), state: phase === "loading" ? (progress >= 50 ? "active" : "pending") : "done" },
    { label: t("steps.recognize"), state: phase === "recognizing" ? "active" : phase === "done" ? "done" : "pending" },
  ];

  const toolbar = (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-8 items-center justify-center overflow-hidden rounded-xs bg-surface-2">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="" className="size-full object-cover" />
          ) : (
            <ImageIcon className="size-4 text-fg-muted" aria-hidden />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-semibold text-fg">{file.name}</span>
          <span className="truncate text-xs text-fg-subtle">{formatBytes(file.size)}</span>
        </div>
      </div>
      <button type="button" onClick={reset} className={toolButton}>
        {t("drop")}
      </button>
    </>
  );

  const preview = previewUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={previewUrl} alt={file.name} className="max-h-full max-w-full object-contain p-4 md:p-10" />
  ) : null;

  const settings = (
    <>
      <SettingsGroup label={t("language")}>
        <NativeSelect label="" value={lang} onChange={setLang} options={LANGS.map((l) => ({ value: l, label: t(`langs.${l}`) }))} className="[&>span]:hidden [&>select]:w-full [&>select]:flex-1" />
      </SettingsGroup>
      {(phase === "loading" || phase === "recognizing") && (
        <ProcessingCard
          title={phase === "loading" ? t("loadingEngine") : t("recognizing")}
          percent={phase === "loading" ? progress * 0.3 : 30 + progress * 0.7}
          steps={steps}
          onCancel={cancel}
          className="max-w-none p-4"
        />
      )}
      {phase === "error" && (
        <div role="alert" className="rounded-sm border border-danger/20 bg-danger-soft p-3 text-xs text-fg">
          {error}
        </div>
      )}
      {phase !== "loading" && phase !== "recognizing" && (
        <button type="button" onClick={() => run(file, lang)} className="flex h-10 items-center justify-center gap-2 rounded-sm bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
          <ScanText className="size-4" aria-hidden />
          {phase === "done" ? t("recognizing").replace("…", "") : c.name}
        </button>
      )}
      <SettingsGroup label={t("result")} value={confidence !== null ? t("confidence", { percent: confidence }) : undefined} className="min-h-0 flex-1">
        <div className="flex min-h-[200px] flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={phase === "done" && !text ? t("empty") : undefined}
            aria-label={t("result")}
            className={cn(textareaClass, "font-sans")}
          />
          <div className="flex items-center justify-end gap-1.5 border-t border-border p-2">
            <button type="button" className={toolButton} disabled={!text} onClick={() => downloadBlob(new Blob([text], { type: "text/plain" }), outputFileName(file.name, "ocr", "txt"))}>
              <Download className="size-3.5 text-fg-muted" aria-hidden />
              {t("downloadTxt")}
            </button>
            <CopyButton text={text} />
          </div>
        </div>
      </SettingsGroup>
    </>
  );

  return (
    <ToolShell
      toolbar={toolbar}
      preview={preview}
      settings={settings}
      footer={
        <ExportBar
          onReset={reset}
          downloadDisabled={!text}
          downloadLabel={t("downloadTxt")}
          onDownload={() => downloadBlob(new Blob([text], { type: "text/plain" }), outputFileName(file.name, "ocr", "txt"))}
        />
      }
    />
  );
}
