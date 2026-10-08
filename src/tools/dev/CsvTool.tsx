"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Papa from "papaparse";
import { FileSpreadsheet } from "lucide-react";
import { TwoPaneTool, NativeSelect, OptionCheckbox, toolButton } from "@/components/shell/TwoPaneTool";
import { Segmented } from "@/components/shell/Segmented";
import { downloadBlob } from "@/lib/download";

type Format = "csv" | "json";
type Delim = "auto" | "," | ";" | "\t";
type Table = { header: string[]; rows: string[][] };

function toTable(input: string, from: Format, header: boolean, delim: Delim): { table: Table | null; error: string | null } {
  if (!input.trim()) return { table: null, error: null };
  if (from === "csv") {
    const res = Papa.parse<string[]>(input.trim(), { delimiter: delim === "auto" ? "" : delim, skipEmptyLines: true });
    const data = res.data;
    if (!data.length) return { table: null, error: null };
    if (header) return { table: { header: data[0].map(String), rows: data.slice(1) }, error: null };
    return { table: { header: data[0].map((_, i) => `col${i + 1}`), rows: data }, error: null };
  }
  try {
    const parsed = JSON.parse(input) as unknown;
    if (!Array.isArray(parsed)) return { table: null, error: "invalidJson" };
    if (parsed.length === 0) return { table: { header: [], rows: [] }, error: null };
    if (Array.isArray(parsed[0])) {
      const rows = (parsed as unknown[][]).map((r) => r.map((v) => (v === null || v === undefined ? "" : String(v))));
      return header ? { table: { header: rows[0], rows: rows.slice(1) }, error: null } : { table: { header: rows[0].map((_, i) => `col${i + 1}`), rows }, error: null };
    }
    if (typeof parsed[0] === "object") {
      const keys = Array.from(new Set((parsed as Record<string, unknown>[]).flatMap((o) => Object.keys(o))));
      const rows = (parsed as Record<string, unknown>[]).map((o) => keys.map((k) => (o[k] === null || o[k] === undefined ? "" : typeof o[k] === "object" ? JSON.stringify(o[k]) : String(o[k]))));
      return { table: { header: keys, rows }, error: null };
    }
    return { table: null, error: "invalidJson" };
  } catch {
    return { table: null, error: "invalidJson" };
  }
}

function coerce(v: string): unknown {
  if (v === "") return "";
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(v) && v.length < 16) return Number(v);
  return v;
}

function fromTable(table: Table, to: Format, header: boolean): string {
  if (to === "csv") return Papa.unparse(header ? [table.header, ...table.rows] : table.rows);
  if (!header) return JSON.stringify(table.rows.map((r) => r.map(coerce)), null, 2);
  return JSON.stringify(
    table.rows.map((r) => Object.fromEntries(table.header.map((h, i) => [h, coerce(r[i] ?? "")]))),
    null,
    2,
  );
}

export default function CsvTool() {
  const t = useTranslations("dev.csv");
  const [input, setInput] = useState("");
  const [from, setFrom] = useState<Format>("csv");
  const [to, setTo] = useState<Format>("json");
  const [header, setHeader] = useState(true);
  const [delim, setDelim] = useState<Delim>("auto");
  const [sheetName, setSheetName] = useState<string | null>(null);

  const parsed = useMemo(() => toTable(input, from, header, delim), [input, from, header, delim]);
  const output = parsed.table ? fromTable(parsed.table, to, header) : "";

  const onFile = async (file: File) => {
    const name = file.name.toLowerCase();
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      setSheetName(wb.SheetNames[0]);
      setFrom("csv");
      setInput(XLSX.utils.sheet_to_csv(ws));
      return;
    }
    setSheetName(null);
    const text = await file.text();
    setFrom(name.endsWith(".json") ? "json" : "csv");
    setInput(text);
  };

  const downloadXlsx = async () => {
    if (!parsed.table) return;
    const XLSX = await import("xlsx");
    const aoa = header ? [parsed.table.header, ...parsed.table.rows] : parsed.table.rows;
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName ?? "Sheet1");
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    downloadBlob(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "table.xlsx");
  };

  const sample = from === "csv" ? "name,city,age\nAna,Madrid,31\nLuis,Bogotá,27\nMei,Taipei,35" : '[{"name":"Ana","city":"Madrid","age":31},{"name":"Luis","city":"Bogotá","age":27}]';

  return (
    <TwoPaneTool
      input={input}
      onInputChange={(v) => {
        setSheetName(null);
        setInput(v);
      }}
      inputPlaceholder={t("placeholder")}
      sample={sample}
      accept={[".csv", ".tsv", ".json", ".xlsx", ".xls", "text/csv", "application/json"]}
      onFile={onFile}
      output={output}
      error={parsed.error ? t("invalidJson") : null}
      downloadName={to === "csv" ? "table.csv" : "table.json"}
      downloadMime={to === "csv" ? "text/csv" : "application/json"}
      inputMeta={parsed.table ? t("rows", { rows: parsed.table.rows.length, cols: parsed.table.header.length }) : undefined}
      outputActions={
        <button type="button" onClick={downloadXlsx} disabled={!parsed.table} className={toolButton}>
          <FileSpreadsheet className="size-3.5 text-fg-muted" aria-hidden />
          <span className="hidden sm:inline">{t("downloadXlsx")}</span>
        </button>
      }
      options={
        <>
          <Segmented
            label={t("from")}
            size="sm"
            className="w-auto"
            value={from}
            onChange={setFrom}
            options={[
              { value: "csv", label: `${t("from")}: ${t("csv")}` },
              { value: "json", label: `${t("from")}: ${t("json")}` },
            ]}
          />
          <Segmented
            label={t("to")}
            size="sm"
            className="w-auto"
            value={to}
            onChange={setTo}
            options={[
              { value: "json", label: `${t("to")}: ${t("json")}` },
              { value: "csv", label: `${t("to")}: ${t("csv")}` },
            ]}
          />
          {from === "csv" && (
            <NativeSelect
              label={t("delimiter")}
              value={delim}
              onChange={setDelim}
              options={[
                { value: "auto", label: t("auto") },
                { value: ",", label: t("comma") },
                { value: ";", label: t("semicolon") },
                { value: "\t", label: t("tab") },
              ]}
            />
          )}
          <OptionCheckbox label={t("header")} checked={header} onChange={setHeader} />
        </>
      }
      status={
        parsed.table && parsed.table.rows.length > 0 ? (
          <div className="scrollbar-thin max-h-28 w-full overflow-auto rounded-sm border border-border">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-surface-2 text-fg-muted">
                <tr>
                  {parsed.table.header.map((h, i) => (
                    <th key={i} className="px-2 py-1 font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.table.rows.slice(0, 5).map((r, i) => (
                  <tr key={i} className="border-t border-border text-fg">
                    {r.map((c, j) => (
                      <td key={j} className="max-w-[160px] truncate px-2 py-1">
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <span className="text-fg-subtle">{t("xlsxHint")}</span>
        )
      }
    />
  );
}
