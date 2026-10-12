"use client";

import { useId, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowUpDown } from "lucide-react";
import { ToolHeader, Pane, CopyButton, useClipboard } from "@/components/shell/TwoPaneTool";
import { cn } from "@/lib/utils";
import { DEFAULT_PAIR, QUANTITIES, UNITS, convert, findUnit, formatNumber, parseNumber, type Quantity } from "./lib/units";

const fieldClass =
  "h-12 w-full min-w-0 rounded-md border border-border bg-surface-2 px-3 text-lg font-semibold text-fg tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/60";
const selectClass =
  "h-12 w-full min-w-0 rounded-md border border-border bg-surface-2 px-2.5 text-sm font-medium text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring/60 sm:w-56";

export default function UnitConverterTool() {
  const t = useTranslations("productivity.units");
  const locale = useLocale();
  const { copy } = useClipboard();
  const ids = { value: useId(), from: useId(), to: useId(), result: useId() };

  const [quantity, setQuantity] = useState<Quantity>("length");
  const [fromId, setFromId] = useState(DEFAULT_PAIR.length[0]);
  const [toId, setToId] = useState(DEFAULT_PAIR.length[1]);
  const [raw, setRaw] = useState("1");

  const from = findUnit(quantity, fromId);
  const to = findUnit(quantity, toId);
  const value = parseNumber(raw, locale);
  const name = (id: string) => t(`names.${id}`);

  const result = value === null ? "" : formatNumber(convert(value, from, to), locale);
  const all = useMemo(
    () => (value === null ? [] : UNITS[quantity].map((u) => ({ unit: u, text: formatNumber(convert(value, from, u), locale) }))),
    [value, quantity, from, locale],
  );

  const pickQuantity = (q: Quantity) => {
    setQuantity(q);
    setFromId(DEFAULT_PAIR[q][0]);
    setToId(DEFAULT_PAIR[q][1]);
  };
  const swap = () => {
    setFromId(to.id);
    setToId(from.id);
    // Carry the converted value over so the swap reads naturally (1 cm → 0.39 in becomes 0.39 in → 1 cm).
    if (result && result !== "—") setRaw(result);
  };

  const unitOptions = UNITS[quantity].map((u) => (
    <option key={u.id} value={u.id}>
      {name(u.id)} ({u.symbol})
    </option>
  ));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center border-b border-border px-4 py-3 md:px-6">
        <ToolHeader />
      </div>
      <div className="grid min-h-0 flex-1 gap-3 p-4 md:grid-cols-[1fr_360px] md:p-6">
        <Pane title={t("quantity")}>
          <div className="flex flex-1 flex-col gap-6 p-4">
            <div role="radiogroup" aria-label={t("quantity")} className="flex flex-wrap gap-1.5">
              {QUANTITIES.map((q) => (
                <button
                  key={q}
                  type="button"
                  role="radio"
                  aria-checked={q === quantity}
                  onClick={() => pickQuantity(q)}
                  className={cn(
                    "h-8 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
                    q === quantity ? "border-primary-line bg-primary-soft text-primary" : "border-border bg-surface-2 text-fg-muted hover:text-fg",
                  )}
                >
                  {t(`quantities.${q}`)}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor={ids.value} className="text-xs font-medium text-fg-muted">
                {t("from")}
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id={ids.value}
                  inputMode="decimal"
                  autoComplete="off"
                  spellCheck={false}
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  aria-invalid={raw.trim() !== "" && value === null}
                  className={cn(fieldClass, raw.trim() !== "" && value === null && "border-danger")}
                />
                <select id={ids.from} aria-label={t("from")} value={from.id} onChange={(e) => setFromId(e.target.value)} className={selectClass}>
                  {unitOptions}
                </select>
              </div>
              {raw.trim() !== "" && value === null && <p className="text-xs text-danger">{t("invalid")}</p>}
            </div>

            <button
              type="button"
              onClick={swap}
              aria-label={t("swap")}
              title={t("swap")}
              className="flex size-10 items-center justify-center self-center rounded-full border border-border bg-surface-2 text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
            >
              <ArrowUpDown className="size-4" aria-hidden />
            </button>

            <div className="flex flex-col gap-2">
              <label htmlFor={ids.result} className="text-xs font-medium text-fg-muted">
                {t("to")}
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <output id={ids.result} aria-live="polite" className={cn(fieldClass, "flex items-center overflow-x-auto bg-surface text-primary")}>
                  {result}
                </output>
                <select id={ids.to} aria-label={t("to")} value={to.id} onChange={(e) => setToId(e.target.value)} className={selectClass}>
                  {unitOptions}
                </select>
              </div>
            </div>

            {result && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface-2 px-3 py-2.5">
                <span className="text-sm text-fg tabular-nums">
                  {formatNumber(value ?? 0, locale)} {from.symbol} = <strong className="font-semibold">{result}</strong> {to.symbol}
                </span>
                <CopyButton text={result} />
              </div>
            )}
          </div>
        </Pane>

        <Pane title={t("all")} meta={t(`quantities.${quantity}`)}>
          <ul className="scrollbar-thin flex flex-1 flex-col divide-y divide-border overflow-y-auto">
            {all.map(({ unit, text }) => (
              <li key={unit.id}>
                <button
                  type="button"
                  onClick={() => copy(text)}
                  className={cn(
                    "flex w-full items-baseline justify-between gap-3 px-4 py-2.5 text-start transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none",
                    unit.id === to.id && "bg-primary-soft",
                  )}
                >
                  <span className="truncate text-[13px] text-fg-muted">{name(unit.id)}</span>
                  <span className="shrink-0 text-[13px] font-semibold text-fg tabular-nums">
                    {text} <span className="font-normal text-fg-subtle">{unit.symbol}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="border-t border-border px-4 py-2.5 text-xs text-fg-subtle">{t("copyHint")}</p>
        </Pane>
      </div>
    </div>
  );
}
