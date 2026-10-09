"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { Camera, CameraOff, Download, ExternalLink } from "lucide-react";
import { DropZone, Segmented } from "@/components/shell";
import { ToolHeader, Pane, CopyButton, NativeSelect, OptionCheckbox, textareaClass, toolButton } from "@/components/shell/TwoPaneTool";
import { Slider } from "@/components/ui/slider";
import { downloadBlob } from "@/lib/download";
import { cn } from "@/lib/utils";

type Mode = "generate" | "scan";
type Level = "L" | "M" | "Q" | "H";

export default function QrTool() {
  const t = useTranslations("privacy.qr");
  const [mode, setMode] = useState<Mode>("generate");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6">
        <ToolHeader />
        <Segmented
          label={t("generate")}
          size="sm"
          className="w-auto"
          value={mode}
          onChange={setMode}
          options={[
            { value: "generate", label: t("generate") },
            { value: "scan", label: t("scan") },
          ]}
        />
      </div>
      {mode === "generate" ? <Generate /> : <Scan />}
    </div>
  );
}

function Generate() {
  const t = useTranslations("privacy.qr");
  const [text, setText] = useState("https://www.careperroshouse.com");
  const [size, setSize] = useState(320);
  const [margin, setMargin] = useState(2);
  const [level, setLevel] = useState<Level>("M");
  const [dark, setDark] = useState("#000000");
  const [light, setLight] = useState("#ffffff");
  const [transparent, setTransparent] = useState(false);
  const [dataUrl, setDataUrl] = useState("");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!text) return;
    let cancelled = false;
    const opts = { errorCorrectionLevel: level, margin, color: { dark, light: transparent ? "#0000" : light } };
    Promise.all([QRCode.toDataURL(text, { ...opts, width: size }), QRCode.toString(text, { ...opts, type: "svg" })])
      .then(([png, s]) => {
        if (cancelled) return;
        setDataUrl(png);
        setSvg(s);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError(t("tooLong"));
      });
    return () => {
      cancelled = true;
    };
  }, [text, size, margin, level, dark, light, transparent, t]);

  const shownUrl = text ? dataUrl : "";
  const shownSvg = text ? svg : "";

  const downloadPng = async () => {
    const blob = await (await fetch(shownUrl)).blob();
    downloadBlob(blob, "qr-code.png");
  };

  return (
    <div className="grid min-h-0 flex-1 gap-3 p-4 md:grid-cols-2 md:p-6">
      <Pane title={t("text")} meta={`${text.length}`}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t("placeholder")} aria-label={t("text")} className={cn(textareaClass, "min-h-[120px] flex-none md:min-h-[160px]")} />
        <div className="flex flex-col gap-4 border-t border-border p-4">
          {[
            [t("size"), size, 128, 1024, 32, setSize, "px"],
            [t("margin"), margin, 0, 8, 1, setMargin, ""],
          ].map(([label, value, min, max, step, set, unit]) => (
            <div key={label as string} className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-medium text-fg-muted">{label as string}</span>
                <span className="font-semibold text-fg tabular-nums">
                  {value as number}
                  {unit as string}
                </span>
              </div>
              <Slider value={[value as number]} min={min as number} max={max as number} step={step as number} onValueChange={(v) => (set as (n: number) => void)(Array.isArray(v) ? v[0] : v)} aria-label={label as string} />
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <NativeSelect
              label={t("level")}
              value={level}
              onChange={setLevel}
              options={[
                { value: "L", label: t("levelL") },
                { value: "M", label: t("levelM") },
                { value: "Q", label: t("levelQ") },
                { value: "H", label: t("levelH") },
              ]}
            />
            <label className="flex items-center gap-2 text-xs font-medium text-fg-muted">
              {t("dark")}
              <input type="color" value={dark} onChange={(e) => setDark(e.target.value)} aria-label={t("dark")} className="size-8 cursor-pointer rounded-sm border border-border bg-transparent" />
            </label>
            <label className={cn("flex items-center gap-2 text-xs font-medium text-fg-muted", transparent && "opacity-50")}>
              {t("light")}
              <input type="color" value={light} disabled={transparent} onChange={(e) => setLight(e.target.value)} aria-label={t("light")} className="size-8 cursor-pointer rounded-sm border border-border bg-transparent" />
            </label>
            <OptionCheckbox label={t("transparent")} checked={transparent} onChange={setTransparent} />
          </div>
        </div>
      </Pane>
      <Pane
        title={t("preview")}
        actions={
          <>
            <button type="button" onClick={downloadPng} disabled={!shownUrl} className={toolButton}>
              <Download className="size-3.5 text-fg-muted" aria-hidden /> PNG
            </button>
            <button type="button" onClick={() => downloadBlob(new Blob([shownSvg], { type: "image/svg+xml" }), "qr-code.svg")} disabled={!shownSvg} className={toolButton}>
              <Download className="size-3.5 text-fg-muted" aria-hidden /> SVG
            </button>
          </>
        }
      >
        <div className="flex flex-1 items-center justify-center bg-canvas p-6 [background-image:linear-gradient(45deg,var(--surface-3)_25%,transparent_25%),linear-gradient(-45deg,var(--surface-3)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,var(--surface-3)_75%),linear-gradient(-45deg,transparent_75%,var(--surface-3)_75%)] [background-position:0_0,0_8px,8px_-8px,-8px_0] [background-size:16px_16px]">
          {error ? (
            <p className="text-sm text-danger">{error}</p>
          ) : shownUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shownUrl} alt={text} width={size} height={size} className="max-h-full max-w-full rounded-sm" style={{ imageRendering: "pixelated" }} />
          ) : null}
        </div>
      </Pane>
    </div>
  );
}

function Scan() {
  const t = useTranslations("privacy.qr");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  const decodeImageData = (img: ImageData): string | null => jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" })?.data ?? null;

  const scanFile = async (file: File) => {
    setError(null);
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const found = decodeImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (found) setResult(found);
    else {
      setResult(null);
      setError(t("noCode"));
    }
  };

  const stopCamera = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    setCameraOn(false);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setCameraOn(true);
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      const tick = () => {
        if (!streamRef.current) return;
        if (video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          const found = decodeImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
          if (found) {
            setResult(found);
            stopCamera();
            return;
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setError(t("cameraError"));
    }
  };

  useEffect(() => () => stopCamera(), []);

  const isUrl = result ? /^https?:\/\//i.test(result) : false;
  const imageAccept = useMemo(() => ["image/*"], []);

  return (
    <div className="grid min-h-0 flex-1 gap-3 p-4 md:grid-cols-2 md:p-6">
      <div className="flex flex-col gap-3">
        <DropZone accept={imageAccept} title={t("dropScan")} subtitle={t("dropSubtitle")} formats={["PNG", "JPG", "WebP"]} size="compact" onFiles={(f) => scanFile(f[0])} />
        <div className="relative overflow-hidden rounded-lg border border-border bg-canvas">
          <video ref={videoRef} muted playsInline className={cn("aspect-video w-full object-cover", !cameraOn && "hidden")} />
          {!cameraOn && (
            <div className="flex aspect-video items-center justify-center">
              <button type="button" onClick={startCamera} className={toolButton}>
                <Camera className="size-3.5 text-fg-muted" aria-hidden /> {t("camera")}
              </button>
            </div>
          )}
          {cameraOn && (
            <button type="button" onClick={stopCamera} className={cn(toolButton, "absolute end-3 top-3")}>
              <CameraOff className="size-3.5 text-fg-muted" aria-hidden /> {t("stopCamera")}
            </button>
          )}
        </div>
      </div>
      <Pane
        title={t("result")}
        actions={
          <>
            {isUrl && result && (
              <a href={result} target="_blank" rel="noopener noreferrer" className={toolButton}>
                <ExternalLink className="size-3.5 text-fg-muted" aria-hidden /> {t("openLink")}
              </a>
            )}
            <CopyButton text={result ?? ""} />
          </>
        }
      >
        {error ? <p className="p-4 text-sm text-danger">{error}</p> : <textarea readOnly value={result ?? ""} aria-label={t("result")} className={cn(textareaClass, "font-mono")} />}
      </Pane>
    </div>
  );
}
