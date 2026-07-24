import Papa from "papaparse";

/**
 * Parser for period payroll-input CSVs — from the minimal
 * `staffNo,allowances,bonus` file up to a full payroll register exported from
 * Excel (formatted numbers, spacer/total/footer rows, dozens of extra columns).
 *
 * Column handling:
 * - Headers are matched case/punctuation-insensitively.
 * - Fixed columns: Staff No., Basic pay, Allowances (lump "other"), Bonus.
 * - Any column whose name matches a company-defined allowance or benefit
 *   (with or without a trailing "Allowance"/"Benefit") maps to that item and
 *   auto-populates the employee's assignment.
 * - Everything else (PAYE, NSSF, totals, 13th Cheque…) is ignored and reported.
 * Rows without a staff number (spacers, TOTAL, footers) are skipped silently.
 */

export type EarningDef = { id: string; name: string };

export type ParsedRow = {
  rowNo: number; // 1-based line for error reporting (approximate for multi-line cells)
  staffNo: string;
  basicPay: number | null; // null = column absent or cell blank
  otherAllowances: number;
  bonus: number;
  allowanceAmounts: Record<string, number>; // allowance id -> amount
  benefitAmounts: Record<string, number>;   // benefit id -> amount
};

export type ParsedPayrollCsv = {
  rows: ParsedRow[];
  failed: { row: number; error: string }[];
  matchedAllowanceCols: { header: string; name: string }[];
  matchedBenefitCols: { header: string; name: string }[];
  ignoredColumns: string[];
  hasBasicPay: boolean;
  warnings: string[];
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Parse an Excel-style amount: " 5,000.00 ", " - " (zero), "(38.00)"
 * (negative), "KSh 1,200". Returns null when the value is not a number
 * (e.g. "#REF!"); blank and "-" mean 0.
 */
export function parseAmount(raw: unknown): number | null {
  if (raw == null) return 0;
  let s = String(raw).trim();
  if (!s) return 0;
  s = s.replace(/ksh?s?\.?/gi, "").replace(/[,\s]/g, "");
  let negative = false;
  const paren = s.match(/^\((.*)\)$/);
  if (paren) { negative = true; s = paren[1]; }
  if (!s || s === "-") return 0;
  const n = Number(s);
  if (Number.isNaN(n)) return null;
  return negative ? -n : n;
}

// Drop the UTF-8 BOM and any blank/comma-only lines before the header row
// (quoted multi-line cells can only appear after the header, so this is safe).
function stripPreamble(text: string): string {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  let start = 0;
  while (start < lines.length && /^[,\s"]*$/.test(lines[start])) start++;
  return lines.slice(start).join("\n");
}

export function parsePayrollInputsCsv(
  text: string,
  allowances: EarningDef[],
  benefits: EarningDef[]
): ParsedPayrollCsv {
  const parsed = Papa.parse<Record<string, string>>(stripPreamble(text), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const warnings: string[] = [];

  // Build lookup: normalized header -> target. Company items match with or
  // without their section suffix ("House" ⇔ "House Allowance").
  type Target =
    | { kind: "staffNo" | "basicPay" | "other" | "bonus" }
    | { kind: "allowance" | "benefit"; id: string; name: string };
  const lookup = new Map<string, Target>();
  const ambiguous = new Set<string>(); // keys claimed by more than one item
  const put = (key: string, t: Target) => {
    if (!key) return;
    const existing = lookup.get(key);
    if (existing && JSON.stringify(existing) !== JSON.stringify(t)) {
      lookup.delete(key);
      ambiguous.add(key);
      return;
    }
    if (!ambiguous.has(key)) lookup.set(key, t);
  };

  for (const k of ["staffno", "staff", "employeeno", "empno"]) put(k, { kind: "staffNo" });
  put("basicpay", { kind: "basicPay" });
  put("basicsalary", { kind: "basicPay" });
  for (const k of ["allowances", "allowance", "otherallowances"]) put(k, { kind: "other" });
  for (const k of ["bonus", "bonuses"]) put(k, { kind: "bonus" });

  const addEarning = (kind: "allowance" | "benefit", suffix: string, e: EarningDef) => {
    const n = norm(e.name);
    put(n, { kind, id: e.id, name: e.name });
    if (!n.endsWith(suffix)) put(n + suffix, { kind, id: e.id, name: e.name });
    else put(n.slice(0, -suffix.length), { kind, id: e.id, name: e.name });
  };
  allowances.forEach((a) => addEarning("allowance", "allowance", a));
  benefits.forEach((b) => addEarning("benefit", "benefit", b));

  const fields = (parsed.meta.fields ?? []).filter((f) => f && f.trim());
  const colTargets = new Map<string, Target>(); // original header -> target
  const ignoredColumns: string[] = [];
  for (const f of fields) {
    const t = lookup.get(norm(f));
    if (t) colTargets.set(f, t);
    else {
      if (ambiguous.has(norm(f)))
        warnings.push(`Column "${f.trim()}" matches more than one defined item — skipped; rename the item or the column.`);
      ignoredColumns.push(f.replace(/\s+/g, " ").trim());
    }
  }

  const staffNoHeader = fields.find((f) => colTargets.get(f)?.kind === "staffNo");
  const hasBasicPay = fields.some((f) => colTargets.get(f)?.kind === "basicPay");
  const matchedAllowanceCols: { header: string; name: string }[] = [];
  const matchedBenefitCols: { header: string; name: string }[] = [];
  for (const [header, t] of colTargets) {
    if (t.kind === "allowance") matchedAllowanceCols.push({ header: header.trim(), name: t.name });
    if (t.kind === "benefit") matchedBenefitCols.push({ header: header.trim(), name: t.name });
  }

  const rows: ParsedRow[] = [];
  const failed: { row: number; error: string }[] = [];
  if (!staffNoHeader) {
    return {
      rows, failed, matchedAllowanceCols, matchedBenefitCols, ignoredColumns, hasBasicPay,
      warnings: [...warnings, "No 'Staff No.' column found — nothing imported."],
    };
  }

  parsed.data.forEach((raw, i) => {
    const rowNo = i + 2; // header is row 1
    const staffNo = String(raw[staffNoHeader] ?? "").trim();
    if (!staffNo) return; // spacer / TOTAL / footer row

    const row: ParsedRow = {
      rowNo, staffNo, basicPay: null, otherAllowances: 0, bonus: 0,
      allowanceAmounts: {}, benefitAmounts: {},
    };
    for (const [header, target] of colTargets) {
      if (target.kind === "staffNo") continue;
      const cell = raw[header];
      const amount = parseAmount(cell);
      if (amount === null) {
        failed.push({ row: rowNo, error: `"${header.trim()}" has a non-numeric value (${String(cell).trim()})` });
        return;
      }
      if (amount < 0) {
        failed.push({ row: rowNo, error: `"${header.trim()}" is negative (${amount}) — not supported` });
        return;
      }
      if (target.kind === "basicPay") row.basicPay = String(cell ?? "").trim() ? amount : null;
      else if (target.kind === "other") row.otherAllowances = amount;
      else if (target.kind === "bonus") row.bonus = amount;
      else if (target.kind === "allowance") row.allowanceAmounts[target.id] = amount;
      else if (target.kind === "benefit") row.benefitAmounts[target.id] = amount;
    }
    rows.push(row);
  });

  return { rows, failed, matchedAllowanceCols, matchedBenefitCols, ignoredColumns, hasBasicPay, warnings };
}
