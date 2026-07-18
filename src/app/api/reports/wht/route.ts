import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireCompany, ApiError } from "@/lib/auth";
import { handler } from "@/lib/api";

// Auth routes read cookies, so they can never be statically rendered.
export const dynamic = "force-dynamic";

/**
 * GET /api/reports/wht?from=2026-01&to=2026-12 — withholding tax report
 * grouped per payment with per-category totals. &export=csv downloads it.
 */
async function buildReport(companyId: string, from: string, to: string) {
  const start = new Date(`${from}-01`);
  const [y, m] = to.split("-").map(Number);
  const end = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1));
  const payments = await prisma.whtPayment.findMany({
    where: { companyId, paidOn: { gte: start, lt: end } },
    orderBy: { paidOn: "asc" },
  });
  const rows = payments.map((p:any) => ({
    paidOn: p.paidOn.toISOString().slice(0, 10),
    payeeName: p.payeeName,
    payeePin: p.payeePin ?? "",
    category: p.category,
    resident: p.resident ? "Resident" : "Non-resident",
    grossAmount: Number(p.grossAmount),
    whtAmount: Number(p.whtAmount),
  }));
  const byCategory = new Map<string, { gross: number; wht: number; count: number }>();
  for (const r of rows) {
    const key = `${r.category} (${r.resident})`;
    const agg = byCategory.get(key) ?? { gross: 0, wht: 0, count: 0 };
    agg.gross += r.grossAmount;
    agg.wht += r.whtAmount;
    agg.count += 1;
    byCategory.set(key, agg);
  }
  return {
    from, to, rows,
    totals: [...byCategory.entries()].map(([category, v]) => ({ category, ...v })),
    grandTotal: rows.reduce((a: number, r: typeof rows[number]) => a + r.whtAmount, 0),
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
  const from = url.searchParams.get("from") ?? new Date().toISOString().slice(0, 4) + "-01";
  const to = url.searchParams.get("to") ?? new Date().toISOString().slice(0, 7);
  if (url.searchParams.get("export") !== "csv") {
    return handler(async () => {
      const { companyId } = await requireCompany("reports.view");
      return buildReport(companyId, from, to);
    })(req, {});
  }
  try {
    const { companyId } = await requireCompany("reports.export");
    const report = await buildReport(companyId, from, to);
    return new NextResponse(toCsv(report.rows), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="wht-report-${from}-to-${to}.csv"`,
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
