import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireCompany, ApiError } from "@/lib/auth";
import { handler } from "@/lib/api";

// Auth routes read cookies, so they can never be statically rendered.
export const dynamic = "force-dynamic";

/**
 * GET /api/reports/returns?type=p10|nssf|shif|housing&period=2026-07
 * Statutory return extracts built from an APPROVED payroll run:
 *  - p10:     KRA PAYE return (PIN, name, gross, taxable, PAYE)
 *  - nssf:    NSSF contribution return (member no, ID, employee + employer)
 *  - shif:    SHIF contribution return (member no, contribution)
 *  - housing: Affordable Housing Levy return (employee + employer 1.5%)
 * Add &export=csv to download (reports.export); otherwise JSON (reports.view).
 */
const TYPES: Record<string, { label: string; line: string }> = {
  p10: { label: "KRA P10 (PAYE)", line: "PAYE" },
  nssf: { label: "NSSF return", line: "NSSF" },
  shif: { label: "SHIF return", line: "SHIF" },
  housing: { label: "Housing Levy return", line: "Housing Levy" },
};

async function buildReturn(companyId: string, type: string, period: string) {
  const def = TYPES[type];
  if (!def) throw new ApiError(400, `type must be one of: ${Object.keys(TYPES).join(", ")}`);
  const run = await prisma.payrollRun.findUnique({
    where: { companyId_period: { companyId, period } },
    include: { company: true, payslips: { include: { employee: true, lines: true } } },
  });
  if (!run) throw new ApiError(404, `No payroll run for ${period}`);
  if (run.status !== "APPROVED")
    throw new ApiError(422, `Statutory returns are generated from approved runs only — the ${period} run is ${run.status.toLowerCase()}`);

  const rows = run.payslips
    .map((p: typeof run.payslips[number]) => {
      const line = p.lines.find((l: { label: string }) => l.label === def.line);
      if (!line) return null;
      const e = p.employee;
      const base = {
        staffNo: e.staffNo,
        name: `${e.firstName} ${e.lastName}`,
      };
      switch (type) {
        case "p10":
          return {
            kraPin: e.kraPin ?? "",
            ...base,
            grossPay: Number(p.grossPay),
            taxablePay: Number(p.taxablePay),
            paye: Number(line.amount),
          };
        case "nssf":
          return {
            nssfNo: e.nssfNo ?? "",
            nationalId: e.nationalId ?? "",
            ...base,
            grossPay: Number(p.grossPay),
            employeeContribution: Number(line.amount),
            employerContribution: line.employerAmount ? Number(line.employerAmount) : 0,
            total: Number(line.amount) + (line.employerAmount ? Number(line.employerAmount) : 0),
          };
        case "shif":
          return {
            shifNo: e.shifNo ?? "",
            nationalId: e.nationalId ?? "",
            ...base,
            grossPay: Number(p.grossPay),
            contribution: Number(line.amount),
          };
        case "housing":
          return {
            kraPin: e.kraPin ?? "",
            ...base,
            grossPay: Number(p.grossPay),
            employeeLevy: Number(line.amount),
            employerLevy: line.employerAmount ? Number(line.employerAmount) : 0,
            total: Number(line.amount) + (line.employerAmount ? Number(line.employerAmount) : 0),
          };
      }
      return null;
    })
    .filter(Boolean) as Record<string, any>[];

  const numericKeys = rows.length
    ? Object.keys(rows[0]).filter((k) => typeof rows[0][k] === "number")
    : [];
  const totals: Record<string, number> = {};
  for (const k of numericKeys) totals[k] = rows.reduce((a, r) => a + r[k], 0);

  return {
    type, label: def.label, period,
    company: { name: run.company.name, kraPin: run.company.kraPin },
    rows, totals,
  };
}

function toCsv(rows: Record<string, any>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: any) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "";
  const period = url.searchParams.get("period") ?? "";
  if (url.searchParams.get("export") !== "csv") {
    return handler(async () => {
      const { companyId } = await requireCompany("reports.view");
      if (!period) throw new ApiError(400, "period is required (YYYY-MM)");
      return buildReturn(companyId, type, period);
    })(req, {});
  }
  try {
    const { companyId } = await requireCompany("reports.export");
    if (!period) throw new ApiError(400, "period is required (YYYY-MM)");
    const rpt = await buildReturn(companyId, type, period);
    return new NextResponse(toCsv(rpt.rows), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${type}-return-${period}.csv"`,
      },
    });
  } catch (err: any) {
    if (err instanceof ApiError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }
    console.error(err);
    return NextResponse.json({ ok: false, error: "Something went wrong" }, { status: 500 });
  }
}
