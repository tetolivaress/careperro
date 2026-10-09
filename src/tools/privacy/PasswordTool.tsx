"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { ToolHeader, Pane, CopyButton, OptionCheckbox, NativeSelect, primaryButton } from "@/components/shell/TwoPaneTool";
import { Segmented } from "@/components/shell/Segmented";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { entropyBits, generatePassphrase, generatePassword, passphraseBits, strengthFor, type PasswordOptions, type Strength } from "./lib/password";

type Mode = "password" | "passphrase";
const DEFAULTS: PasswordOptions = { length: 20, lower: true, upper: true, digits: true, symbols: true, excludeAmbiguous: false };

const STRENGTH_COLOR: Record<Strength, string> = { weak: "bg-danger", fair: "bg-warning", good: "bg-primary/70", strong: "bg-primary" };
const STRENGTH_WIDTH: Record<Strength, string> = { weak: "w-1/4", fair: "w-2/4", good: "w-3/4", strong: "w-full" };

export default function PasswordTool() {
  const t = useTranslations("privacy.password");
  const [mode, setMode] = useState<Mode>("password");
  const [opts, setOpts] = useState<PasswordOptions>(DEFAULTS);
  const [words, setWords] = useState(4);
  const [separator, setSeparator] = useState<"-" | "." | " " | "_">("-");
  const [capitalize, setCapitalize] = useState(true);
  const [addNumber, setAddNumber] = useState(true);
  const [count, setCount] = useState(1);
  const [history, setHistory] = useState<string[]>([]);

  const gen = (m: Mode, o: PasswordOptions, w: number, sep: string, cap: boolean, num: boolean, n: number) =>
    Array.from({ length: n }, () => (m === "password" ? generatePassword(o) : generatePassphrase(w, sep, cap, num)));

  // Start empty so server and client markup match; the first password is generated right after mount.
  const [values, setValues] = useState<string[]>([]);
  useEffect(() => {
    const id = requestAnimationFrame(() => setValues(gen("password", DEFAULTS, 4, "-", true, true, 1)));
    return () => cancelAnimationFrame(id);
  }, []);

  const regenerate = (patch: { mode?: Mode; opts?: PasswordOptions; words?: number; sep?: typeof separator; cap?: boolean; num?: boolean; count?: number } = {}) => {
    const m = patch.mode ?? mode, o = patch.opts ?? opts, w = patch.words ?? words, s = patch.sep ?? separator, c = patch.cap ?? capitalize, n = patch.num ?? addNumber, k = patch.count ?? count;
    const next = gen(m, o, w, s, c, n, k);
    setValues(next);
    setHistory((h) => [values[0], ...h].filter(Boolean).slice(0, 5));
  };

  const bits = mode === "password" ? entropyBits(opts) : passphraseBits(words, addNumber);
  const strength = strengthFor(bits);
  const setOpt = (patch: Partial<PasswordOptions>) => {
    const next = { ...opts, ...patch };
    const anySet = next.lower || next.upper || next.digits || next.symbols;
    if (!anySet) return;
    setOpts(next);
    regenerate({ opts: next });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6">
        <ToolHeader />
        <Segmented
          label={t("mode")}
          size="sm"
          className="w-auto"
          value={mode}
          onChange={(m) => {
            setMode(m);
            regenerate({ mode: m });
          }}
          options={[
            { value: "password", label: t("password") },
            { value: "passphrase", label: t("passphrase") },
          ]}
        />
      </div>
      <div className="grid min-h-0 flex-1 gap-3 p-4 md:grid-cols-[1fr_360px] md:p-6">
        <Pane title={t(mode)} actions={<CopyButton text={values.join("\n")} />}>
          <div className="flex flex-1 flex-col gap-4 p-4">
            {values.map((v, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 p-3">
                <code className="flex-1 font-mono text-base break-all text-fg select-all">{v}</code>
                <CopyButton text={v} className="h-8 shrink-0" />
              </div>
            ))}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-fg-muted">{t("strength")}</span>
                <span className="font-semibold text-fg">
                  {t(strength)} · {t("bits", { bits: Math.round(bits) })}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                <div className={cn("h-full rounded-full transition-all", STRENGTH_COLOR[strength], STRENGTH_WIDTH[strength])} />
              </div>
            </div>
            <button type="button" onClick={() => regenerate()} className={cn(primaryButton, "self-start")}>
              <RefreshCw className="size-4" aria-hidden /> {t("regenerate")}
            </button>
            {history.length > 0 && (
              <div className="mt-auto flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">{t("history")}</span>
                <ul className="flex flex-col gap-1">
                  {history.map((h, i) => (
                    <li key={`${h}-${i}`} className="flex items-center justify-between gap-2 text-xs">
                      <code className="truncate font-mono text-fg-muted">{h}</code>
                      <CopyButton text={h} className="h-6 px-2" />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-fg-subtle">{t("hint")}</p>
          </div>
        </Pane>
        <Pane title={t("mode")}>
          <div className="flex flex-1 flex-col gap-5 p-4">
            {mode === "password" ? (
              <>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="font-medium text-fg-muted">{t("length")}</span>
                    <span className="font-semibold text-fg tabular-nums">{opts.length}</span>
                  </div>
                  <Slider value={[opts.length]} min={6} max={64} step={1} onValueChange={(v) => setOpt({ length: Array.isArray(v) ? v[0] : v })} aria-label={t("length")} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <OptionCheckbox label={t("lower")} checked={opts.lower} onChange={(v) => setOpt({ lower: v })} />
                  <OptionCheckbox label={t("upper")} checked={opts.upper} onChange={(v) => setOpt({ upper: v })} />
                  <OptionCheckbox label={t("digits")} checked={opts.digits} onChange={(v) => setOpt({ digits: v })} />
                  <OptionCheckbox label={t("symbols")} checked={opts.symbols} onChange={(v) => setOpt({ symbols: v })} />
                </div>
                <OptionCheckbox label={t("ambiguous")} checked={opts.excludeAmbiguous} onChange={(v) => setOpt({ excludeAmbiguous: v })} />
              </>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="font-medium text-fg-muted">{t("words")}</span>
                    <span className="font-semibold text-fg tabular-nums">{words}</span>
                  </div>
                  <Slider
                    value={[words]}
                    min={3}
                    max={10}
                    step={1}
                    onValueChange={(v) => {
                      const w = Array.isArray(v) ? v[0] : v;
                      setWords(w);
                      regenerate({ words: w });
                    }}
                    aria-label={t("words")}
                  />
                </div>
                <NativeSelect
                  label={t("separator")}
                  value={separator}
                  onChange={(s) => {
                    setSeparator(s);
                    regenerate({ sep: s });
                  }}
                  options={[
                    { value: "-", label: "-" },
                    { value: ".", label: "." },
                    { value: "_", label: "_" },
                    { value: " ", label: "␣" },
                  ]}
                />
                <OptionCheckbox
                  label={t("capitalize")}
                  checked={capitalize}
                  onChange={(v) => {
                    setCapitalize(v);
                    regenerate({ cap: v });
                  }}
                />
                <OptionCheckbox
                  label={t("addNumber")}
                  checked={addNumber}
                  onChange={(v) => {
                    setAddNumber(v);
                    regenerate({ num: v });
                  }}
                />
              </>
            )}
            <NativeSelect
              label={t("count")}
              value={String(count) as "1" | "5" | "10"}
              onChange={(v) => {
                const n = Number(v);
                setCount(n);
                regenerate({ count: n });
              }}
              options={[
                { value: "1", label: "1" },
                { value: "5", label: "5" },
                { value: "10", label: "10" },
              ]}
            />
          </div>
        </Pane>
      </div>
    </div>
  );
}
