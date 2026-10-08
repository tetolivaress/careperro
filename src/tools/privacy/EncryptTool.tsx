"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, FileLock2, Info, Lock, LockOpen } from "lucide-react";
import { DropZone, DoneCard, ExportBar, ProcessingCard, Segmented, SettingsGroup, ToolShell } from "@/components/shell";
import { primaryButton } from "@/components/shell/TwoPaneTool";
import { IconTile } from "@/components/ui/icon-tile";
import { downloadBlob } from "@/lib/download";
import { formatBytes } from "@/lib/formatBytes";
import { takeFiles } from "@/lib/fileHandoff";
import { useToolShellStore } from "@/stores/toolShell";
import { useSessionStore } from "@/stores/session";
import { useCurrentTool } from "@/tools/useCurrentTool";
import { useToolCopy } from "@/tools/copy";
import { cryptoWorker } from "./lib/cryptoClient";
import { isEncryptedContainer } from "./lib/encryption";
import { cn } from "@/lib/utils";

type Mode = "encrypt" | "decrypt";
type Phase = "idle" | "working" | "done" | "error";

export default function EncryptTool() {
  const t = useTranslations("privacy.encrypt");
  const tool = useCurrentTool();
  const copy = useToolCopy();
  const [mode, setMode] = useState<Mode>("encrypt");
  const [file, setFile] = useState<File | null>(() => takeFiles()?.[0] ?? null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<{ blob: Blob; name: string } | null>(null);
  const setShellFile = useToolShellStore((s) => s.setFile);
  const recordProcessed = useSessionStore((s) => s.recordProcessed);

  useEffect(() => {
    setShellFile(file ? { name: file.name, meta: formatBytes(file.size) } : null);
  }, [file, setShellFile]);

  const pick = async (f: File) => {
    setFile(f);
    setResult(null);
    setPhase("idle");
    setError(null);
    setNotice(null);
    // Sniff the header so dropping a .cbt file flips to decrypt automatically.
    const head = new Uint8Array(await f.slice(0, 40).arrayBuffer());
    if (isEncryptedContainer(head)) {
      setMode("decrypt");
      setNotice(t("detected"));
    }
  };

  const outputName = file ? (mode === "encrypt" ? `${file.name}.cbt` : file.name.replace(/\.cbt$/i, "") || "decrypted") : "";
  const passwordError = mode === "encrypt" ? (password && password.length < 8 ? t("tooShort") : confirm && password !== confirm ? t("mismatch") : null) : null;
  const canRun = Boolean(file && password && !passwordError && (mode === "decrypt" || confirm === password));

  const run = async () => {
    if (!file || !canRun) return;
    setPhase("working");
    setError(null);
    try {
      const w = cryptoWorker();
      if (mode === "encrypt") {
        const bytes = await w.encrypt(file, password);
        setResult({ blob: new Blob([bytes as BlobPart], { type: "application/octet-stream" }), name: outputName });
      } else {
        const r = await w.decrypt(file, password);
        if (!r.ok) {
          setError(r.reason === "wrong-password" ? t("wrongPassword") : t("notEncrypted"));
          setPhase("error");
          return;
        }
        setResult({ blob: new Blob([r.data as BlobPart]), name: outputName });
      }
      setPhase("done");
      recordProcessed();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  };

  const reset = () => {
    setFile(null);
    setPassword("");
    setConfirm("");
    setResult(null);
    setPhase("idle");
    setError(null);
    setNotice(null);
  };

  if (!tool) return null;
  const c = copy(tool);

  const modeSwitch = (
    <Segmented
      label={t("mode")}
      value={mode}
      onChange={(m) => {
        setMode(m);
        setResult(null);
        setPhase("idle");
        setError(null);
      }}
      options={[
        { value: "encrypt", label: t("encrypt") },
        { value: "decrypt", label: t("decrypt") },
      ]}
    />
  );

  if (!file) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-5 py-10 md:px-12">
        <div className="flex max-w-[640px] flex-col items-center gap-3 text-center">
          <IconTile icon="file-lock-2" size={52} />
          <h1 className="text-2xl font-bold tracking-tight text-fg">{c.name}</h1>
          <p className="text-sm text-fg-muted">{c.description}</p>
        </div>
        <div className="w-full max-w-[320px]">{modeSwitch}</div>
        <DropZone
          className="w-full max-w-[640px]"
          accept={mode === "decrypt" ? [".cbt", "application/octet-stream"] : []}
          maxSize={tool.maxSize}
          title={mode === "encrypt" ? t("drop") : t("dropDecrypt")}
          subtitle={t("dropSubtitle")}
          formats={mode === "encrypt" ? ["PDF", "JPG", "DOCX", "ZIP", "MP4"] : ["CBT"]}
          onFiles={(files) => pick(files[0])}
        />
      </div>
    );
  }

  const settings = (
    <>
      {modeSwitch}
      {notice && (
        <p className="flex items-start gap-2 rounded-sm bg-primary-soft p-3 text-xs text-primary">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden /> {notice}
        </p>
      )}
      <SettingsGroup label={t("password")}>
        <div className="relative">
          <input
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
            aria-label={t("password")}
            className="h-10 w-full rounded-sm border border-border bg-surface-2 px-3 pe-10 font-mono text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          />
          <button type="button" onClick={() => setShow((v) => !v)} aria-label={t("show")} aria-pressed={show} className="absolute end-2 top-1/2 -translate-y-1/2 rounded-xs p-1 text-fg-subtle hover:text-fg">
            {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>
      </SettingsGroup>
      {mode === "encrypt" && (
        <SettingsGroup label={t("confirm")}>
          <input
            type={show ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
            aria-label={t("confirm")}
            aria-invalid={Boolean(passwordError)}
            className={cn("h-10 w-full rounded-sm border bg-surface-2 px-3 font-mono text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring/60", passwordError ? "border-danger" : "border-border")}
          />
        </SettingsGroup>
      )}
      {passwordError && <p className="text-xs text-danger">{passwordError}</p>}
      {error && (
        <p role="alert" className="rounded-sm border border-danger/20 bg-danger-soft p-3 text-xs text-fg">
          {error}
        </p>
      )}
      {phase === "working" ? (
        <ProcessingCard title={mode === "encrypt" ? t("working", { name: file.name }) : t("workingDecrypt", { name: file.name })} percent={50} className="max-w-none p-4" />
      ) : (
        <button type="button" onClick={run} disabled={!canRun} className={primaryButton}>
          {mode === "encrypt" ? <Lock className="size-4" aria-hidden /> : <LockOpen className="size-4" aria-hidden />}
          {mode === "encrypt" ? t("run") : t("runDecrypt")}
        </button>
      )}
      <div className="flex flex-col divide-y divide-border rounded-lg border border-border text-[13px]">
        <div className="flex h-10 items-center gap-2 px-3.5">
          <span className="w-24 shrink-0 text-fg-subtle">{t("originalName")}</span>
          <span className="truncate font-medium text-fg">{file.name}</span>
        </div>
        <div className="flex h-10 items-center gap-2 px-3.5">
          <span className="w-24 shrink-0 text-fg-subtle">{t("outputName")}</span>
          <span className="truncate font-medium text-fg">{outputName}</span>
        </div>
      </div>
      <details className="mt-auto rounded-lg border border-border p-3.5 text-xs text-fg-muted">
        <summary className="cursor-pointer font-medium text-fg">{t("details")}</summary>
        <p className="mt-2 leading-relaxed">{t("detailsBody")}</p>
      </details>
    </>
  );

  const preview =
    phase === "done" && result ? (
      <DoneCard title={mode === "encrypt" ? t("done") : t("doneDecrypt")} meta={`${result.name} · ${formatBytes(result.blob.size)}`} onAnother={reset} onDownload={() => downloadBlob(result.blob, result.name)} />
    ) : (
      <div className="flex flex-col items-center gap-3 text-center">
        <span className={cn("flex size-20 items-center justify-center rounded-full", mode === "encrypt" ? "bg-primary-soft text-primary" : "bg-surface-2 text-fg-muted")}>
          <FileLock2 className="size-9" aria-hidden />
        </span>
        <span className="text-sm font-medium text-fg">{file.name}</span>
        <span className="text-xs text-fg-subtle">{formatBytes(file.size)}</span>
      </div>
    );

  return (
    <ToolShell
      preview={preview}
      settings={settings}
      footer={
        <ExportBar
          before={file.size}
          after={result?.blob.size}
          onReset={reset}
          downloadDisabled={!result}
          onDownload={() => result && downloadBlob(result.blob, result.name)}
        />
      }
    />
  );
}
