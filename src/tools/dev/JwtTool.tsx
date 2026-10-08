"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Clock, ShieldAlert } from "lucide-react";
import { TwoPaneTool, CopyButton } from "@/components/shell/TwoPaneTool";
import { decodeJwt } from "./lib/encoding";
import { cn } from "@/lib/utils";

const SAMPLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjQ3NjU1OTkwMjJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

function humanDuration(seconds: number): string {
  const s = Math.abs(Math.round(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${(s / 3600).toFixed(1)} h`;
  return `${Math.round(s / 86400)} d`;
}

function Block({ title, value, tone }: { title: string; value: string; tone: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className={cn("text-[11px] font-semibold tracking-wide uppercase", tone)}>{title}</span>
        <CopyButton text={value} className="h-7" />
      </div>
      <pre className="scrollbar-thin overflow-auto rounded-sm border border-border bg-surface-2 p-3 font-mono text-xs leading-relaxed text-fg">{value}</pre>
    </div>
  );
}

export default function JwtTool() {
  const t = useTranslations("dev.jwt");
  const [input, setInput] = useState("");
  // Clock snapshot taken when the token changes, so render stays pure.
  const [now, setNow] = useState(() => Date.now() / 1000);

  const decoded = useMemo(() => {
    if (!input.trim()) return { data: null, error: null as string | null };
    try {
      return { data: decodeJwt(input), error: null };
    } catch (e) {
      return { data: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [input]);

  const d = decoded.data;
  const expState = d?.exp === undefined ? "none" : d.exp < now ? "expired" : "valid";
  const outputText = d ? JSON.stringify({ header: d.header, payload: d.payload }, null, 2) : "";

  return (
    <TwoPaneTool
      input={input}
      onInputChange={(v) => {
        setInput(v);
        setNow(Date.now() / 1000);
      }}
      inputPlaceholder={t("placeholder")}
      sample={SAMPLE}
      outputText={outputText}
      error={decoded.error}
      output={
        d ? (
          <div className="scrollbar-thin flex flex-1 flex-col gap-4 overflow-y-auto p-4">
            <div
              className={cn(
                "flex items-center gap-2 rounded-sm px-3 py-2 text-xs font-medium",
                expState === "expired" ? "bg-danger-soft text-danger" : expState === "valid" ? "bg-primary-soft text-primary" : "bg-surface-2 text-fg-muted",
              )}
            >
              <Clock className="size-3.5" aria-hidden />
              {expState === "expired" && d.exp !== undefined && t("expired", { ago: humanDuration(now - d.exp) })}
              {expState === "valid" && d.exp !== undefined && t("validFor", { duration: humanDuration(d.exp - now) })}
              {expState === "none" && t("noExp")}
              {typeof d.header.alg === "string" && <span className="ms-auto font-mono">{d.header.alg}</span>}
            </div>
            <Block title={t("header")} value={JSON.stringify(d.header, null, 2)} tone="text-danger" />
            <Block title={t("payload")} value={JSON.stringify(d.payload, null, 2)} tone="text-code-literal" />
            <Block title={t("signature")} value={d.signature} tone="text-primary" />
            <dl className="grid grid-cols-2 gap-2 text-xs">
              {d.iat !== undefined && (
                <>
                  <dt className="text-fg-subtle">{t("issued")}</dt>
                  <dd className="text-fg">{new Date(d.iat * 1000).toLocaleString()}</dd>
                </>
              )}
              {d.exp !== undefined && (
                <>
                  <dt className="text-fg-subtle">{t("expires")}</dt>
                  <dd className="text-fg">{new Date(d.exp * 1000).toLocaleString()}</dd>
                </>
              )}
              {d.nbf !== undefined && (
                <>
                  <dt className="text-fg-subtle">{t("notBefore")}</dt>
                  <dd className="text-fg">{new Date(d.nbf * 1000).toLocaleString()}</dd>
                </>
              )}
            </dl>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-fg-subtle">{t("placeholder")}</div>
        )
      }
      status={
        <span className="flex items-center gap-1.5 text-warning">
          <ShieldAlert className="size-4" aria-hidden />
          {t("unverified")}
        </span>
      }
    />
  );
}
