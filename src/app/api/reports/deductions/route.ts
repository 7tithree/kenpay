import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireCompany, ApiError } from "@/lib/auth";
import { handler } from "@/lib/api";

// Auth routes read cookies, so they can never be statically rendered.
export const dynamic = "force-dynamic";

/**
 * GET /api/reports/deductions?period=2026-07
 *   → summary: one row per deduction (employees, employee total, employer total)
 * GET /api/reports/deductions?period=2026-07&label=PAYE
 *   → detail: one row per employee for that deduction
 * Add &export=csv to download either as CSV (requires reports.export).
 */
async function buildReport(period: string, label: string | null, companyId: string) {
  const run = await prisma.payrollRun.findUnique({
    where: { companyId_period: { companyId, period } },
    include: { payslips: { include: { employee: true, lines: true } } },
  });
  if (!run) throw new ApiError(404, `No payroll run for ${period}`);
  if (run.status === "CANCELLED") throw new ApiError(422, `The ${period} run was cancelled`);

  if (label) {
    const rows = run.payslips
      .map((p: any) => {
        const line = p.lines.find(
          (l: any) => l.label === label && (l.kind === "DEDUCTION" || l.kind === "SCHEME")
        );
        if (!line) return null;
        return {
          staffNo: p.employee.staffNo,
          name: `${p.employee.firstName} ${p.employee.lastName}`,
          kraPin: p.employee.kraPin ?? "",
          amount: Number(line.amount),
          employerAmount: line.employerAmount ? Number(line.employerAmount) : 0,
        };
      })
      .filter(Boolean) as any[];
    const totals = rows.reduce(
      (a, r) => ({ amount: a.amount + r.amount, employerAmount: a.employerAmount + r.employerAmount }),
      { amount: 0, employerAmount: 0 }
    );
    return { kind: "detail" as const, period, status: run.status, label, rows, totals };
  }

  const byLabel = new Map<string, { employees: number; amount: number; employerAmount: number }>();
  for (const p of run.payslips) {
    for (const l of p.lines) {
      if (l.kind !== "DEDUCTION" && l.kind !== "SCHEME") continue;
      const agg = byLabel.get(l.label) ?? { employees: 0, amount: 0, employerAmount: 0 };
      agg.employees += 1;
      agg.amount += Number(l.amount);
      agg.employerAmount += l.employerAmount ? Number(l.employerAmount) : 0;
      byLabel.set(l.label, agg);
    }
  }
  const rows = [...byLabel.entries()].map(([lbl, v]) => ({ label: lbl, ...v }));
  return { kind: "summary" as const, period, status: run.status, rows };
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
  const wantsCsv = url.searchParams.get("export") === "csv";
  if (!wantsCsv) {
    return handler(async () => {
      const { companyId } = await requireCompany("reports.view");
      const period = url.searchParams.get("period");
      if (!period) throw new ApiError(400, "period is required (YYYY-MM)");
      return buildReport(period, url.searchParams.get("label"), companyId);
    })(req, {});
  }
  try {
    const { companyId } = await requireCompany("reports.export");
    const period = url.searchParams.get("period");
    if (!period) throw new ApiError(400, "period is required (YYYY-MM)");
    const report = await buildReport(period, url.searchParams.get("label"), companyId);
    const name =
      report.kind === "detail"
        ? `${report.label}-${period}.csv`.replace(/\s+/g, "_")
        : `deductions-summary-${period}.csv`;
    return new NextResponse(toCsv(report.rows), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${name}"`,
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
