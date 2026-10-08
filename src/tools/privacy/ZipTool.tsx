"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { unzip, zip, type AsyncZippable, type Unzipped } from "fflate";
import { Download, FileArchive, Plus, X } from "lucide-react";
import { DropZone, ExportBar, Segmented, SettingsGroup, SizeReadout, ToolShell } from "@/components/shell";
import { toolButton, NativeSelect } from "@/components/shell/TwoPaneTool";
import { IconTile } from "@/components/ui/icon-tile";
import { downloadBlob, splitFileName } from "@/lib/download";
import { formatBytes } from "@/lib/formatBytes";
import { takeFiles } from "@/lib/fileHandoff";
import { useToolShellStore } from "@/stores/toolShell";
import { useSessionStore } from "@/stores/session";
import { useCurrentTool } from "@/tools/useCurrentTool";
import { useToolCopy } from "@/tools/copy";
import { cn } from "@/lib/utils";

type Mode = "zip" | "unzip";
type Level = "0" | "6" | "9";

const isZip = (f: File) => f.type === "application/zip" || f.type === "application/x-zip-compressed" || /\.zip$/i.test(f.name);

export default function ZipTool() {
  const t = useTranslations("privacy.zip");
  const tool = useCurrentTool();
  const copy = useToolCopy();
  const handed = useMemo(() => takeFiles(), []);
  const [mode, setMode] = useState<Mode>(() => (handed && handed.length === 1 && isZip(handed[0]) ? "unzip" : "zip"));
  const [files, setFiles] = useState<File[]>(() => handed ?? []);
  const [level, setLevel] = useState<Level>("6");
  const [zipName, setZipName] = useState("archive");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Blob | null>(null);
  const [entries, setEntries] = useState<{ name: string; data: Uint8Array }[] | null>(null);
  const setShellFile = useToolShellStore((s) => s.setFile);
  const recordProcessed = useSessionStore((s) => s.recordProcessed);

  const total = files.reduce((n, f) => n + f.size, 0);

  useEffect(() => {
    setShellFile(files.length ? { name: files.length === 1 ? files[0].name : t("files", { count: files.length, size: formatBytes(total) }), meta: formatBytes(total) } : null);
  }, [files, total, setShellFile, t]);

  const addFiles = (list: File[]) => {
    setResult(null);
    setEntries(null);
    setError(null);
    if (mode === "unzip") {
      setFiles([list[0]]);
      if (!isZip(list[0])) setError(t("invalidZip"));
      return;
    }
    setFiles((cur) => [...cur, ...list.filter((f) => !cur.some((c) => c.name === f.name && c.size === f.size))]);
  };

  const buildZip = async () => {
    setBusy(true);
    setError(null);
    try {
      const input: AsyncZippable = {};
      const seen = new Set<string>();
      for (const f of files) {
        let name = f.name;
        let i = 1;
        while (seen.has(name)) {
          const { base, ext } = splitFileName(f.name);
          name = `${base} (${i++})${ext ? `.${ext}` : ""}`;
        }
        seen.add(name);
        input[name] = [new Uint8Array(await f.arrayBuffer()), { level: Number(level) as 0 | 6 | 9 }];
      }
      const bytes = await new Promise<Uint8Array>((resolve, reject) => zip(input, (err, data) => (err ? reject(err) : resolve(data))));
      setResult(new Blob([bytes as BlobPart], { type: "application/zip" }));
      recordProcessed(files.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const extract = async () => {
    const f = files[0];
    if (!f) return;
    setBusy(true);
    setError(null);
    try {
      const data = new Uint8Array(await f.arrayBuffer());
      const out = await new Promise<Unzipped>((resolve, reject) => unzip(data, (err, res) => (err ? reject(err) : resolve(res))));
      const list = Object.entries(out)
        .filter(([name]) => !name.endsWith("/"))
        .map(([name, bytes]) => ({ name, data: bytes }));
      setEntries(list);
      recordProcessed();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(/encrypt/i.test(msg) ? t("encryptedZip") : t("invalidZip"));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setFiles([]);
    setResult(null);
    setEntries(null);
    setError(null);
  };

  if (!tool) return null;
  const c = copy(tool);

  const modeSwitch = (
    <Segmented
      label={t("mode")}
      value={mode}
      onChange={(m) => {
        setMode(m);
        reset();
      }}
      options={[
        { value: "zip", label: t("zip") },
        { value: "unzip", label: t("unzip") },
      ]}
    />
  );

  if (files.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-5 py-10 md:px-12">
        <div className="flex max-w-[640px] flex-col items-center gap-3 text-center">
          <IconTile icon="file-archive" size={52} />
          <h1 className="text-2xl font-bold tracking-tight text-fg">{c.name}</h1>
          <p className="text-sm text-fg-muted">{c.description}</p>
        </div>
        <div className="w-full max-w-[320px]">{modeSwitch}</div>
        <DropZone
          className="w-full max-w-[640px]"
          accept={mode === "unzip" ? [".zip", "application/zip", "application/x-zip-compressed"] : []}
          multiple={mode === "zip"}
          maxSize={tool.maxSize}
          title={mode === "zip" ? t("drop") : t("dropUnzip")}
          subtitle={t("dropSubtitle")}
          formats={mode === "zip" ? ["PDF", "JPG", "DOCX", "MP4", "JSON"] : ["ZIP"]}
          onFiles={addFiles}
        />
      </div>
    );
  }

  const fileList = (
    <ul className="scrollbar-thin flex max-h-72 flex-col divide-y divide-border overflow-y-auto rounded-lg border border-border">
      {files.map((f, i) => (
        <li key={`${f.name}-${i}`} className="flex items-center gap-2.5 px-3 py-2 text-[13px]">
          <FileArchive className="size-4 shrink-0 text-fg-muted" aria-hidden />
          <span className="flex-1 truncate text-fg">{f.name}</span>
          <span className="shrink-0 text-xs text-fg-subtle">{formatBytes(f.size)}</span>
          <button
            type="button"
            aria-label={t("remove", { name: f.name })}
            onClick={() => {
              setFiles((list) => list.filter((_, j) => j !== i));
              setResult(null);
            }}
            className="rounded-xs p-0.5 text-fg-subtle hover:text-danger"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );

  const settings =
    mode === "zip" ? (
      <>
        {modeSwitch}
        <SettingsGroup label={t("files", { count: files.length, size: formatBytes(total) })}>
          {fileList}
          <label className={cn(toolButton, "cursor-pointer self-start")}>
            <Plus className="size-3.5 text-fg-muted" aria-hidden /> {t("addMore")}
            <input type="file" multiple className="sr-only" onChange={(e) => e.target.files && addFiles(Array.from(e.target.files))} />
          </label>
        </SettingsGroup>
        <SettingsGroup label={t("zipName")}>
          <input value={zipName} onChange={(e) => setZipName(e.target.value)} aria-label={t("zipName")} className="h-10 w-full rounded-sm border border-border bg-surface-2 px-3 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring/60" />
        </SettingsGroup>
        <NativeSelect
          label={t("level")}
          value={level}
          onChange={(l) => {
            setLevel(l);
            setResult(null);
          }}
          options={[
            { value: "0", label: t("store") },
            { value: "6", label: t("balanced") },
            { value: "9", label: t("max") },
          ]}
        />
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="mt-auto">{result ? <SizeReadout before={total} after={result.size} caption={t("compressed", { before: formatBytes(total), after: formatBytes(result.size) })} /> : <SizeReadout before={total} />}</div>
      </>
    ) : (
      <>
        {modeSwitch}
        <SettingsGroup label={files[0].name} value={formatBytes(files[0].size)}>
          {error && <p className="text-xs text-danger">{error}</p>}
          {entries ? (
            <ul className="scrollbar-thin flex max-h-[420px] flex-col divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {entries.map((e) => (
                <li key={e.name} className="flex items-center gap-2.5 px-3 py-2 text-[13px]">
                  <span className="flex-1 truncate text-fg" title={e.name}>
                    {e.name}
                  </span>
                  <span className="shrink-0 text-xs text-fg-subtle">{formatBytes(e.data.length)}</span>
                  <button type="button" aria-label={`${t("download")} ${e.name}`} onClick={() => downloadBlob(new Blob([e.data as BlobPart]), e.name.split("/").pop() ?? e.name)} className="rounded-xs p-0.5 text-fg-subtle hover:text-fg">
                    <Download className="size-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <button type="button" onClick={extract} disabled={busy || Boolean(error)} className="flex h-10 items-center justify-center gap-2 rounded-sm bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {busy ? t("extracting") : t("unzip")}
            </button>
          )}
        </SettingsGroup>
      </>
    );

  const preview = (
    <div className="flex flex-col items-center gap-3 text-center">
      <span className="flex size-20 items-center justify-center rounded-full bg-surface-2 text-fg-muted">
        <FileArchive className="size-9" aria-hidden />
      </span>
      <span className="text-sm font-medium text-fg">{mode === "zip" ? `${zipName}.zip` : files[0].name}</span>
      <span className="text-xs text-fg-subtle">{mode === "zip" ? t("files", { count: files.length, size: formatBytes(total) }) : entries ? t("entries", { count: entries.length }) : formatBytes(files[0].size)}</span>
    </div>
  );

  const downloadAllEntries = async () => {
    if (!entries) return;
    for (const e of entries) downloadBlob(new Blob([e.data as BlobPart]), e.name.split("/").pop() ?? e.name);
  };

  return (
    <ToolShell
      preview={preview}
      settings={settings}
      footer={
        mode === "zip" ? (
          <ExportBar
            before={total}
            after={result?.size}
            onReset={reset}
            downloadLabel={busy ? t("zipping") : t("download")}
            downloadDisabled={busy}
            onDownload={async () => {
              if (!result) {
                await buildZip();
                return;
              }
              downloadBlob(result, `${zipName || "archive"}.zip`);
            }}
          />
        ) : (
          <ExportBar onReset={reset} downloadLabel={t("downloadAll")} downloadDisabled={!entries?.length} onDownload={downloadAllEntries} />
        )
      }
    />
  );
}
