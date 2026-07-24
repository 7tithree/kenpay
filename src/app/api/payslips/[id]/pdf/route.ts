import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireCompany, ApiError } from "@/lib/auth";
import { buildPayslipPdf } from "@/lib/payslip-pdf";

// GET /api/payslips/:id/pdf — download one payslip as PDF.
// Returns raw PDF bytes, so it bypasses the JSON handler() wrapper.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { companyId } = await requireCompany("payslip.download");
    const slip = await prisma.payslip.findFirst({
      where: { id: params.id, run: { companyId } },
      include: { run: { include: { company: true } }, employee: true, lines: true },
    });
    if (!slip) throw new ApiError(404, "Payslip not found");

    const pdf = await buildPayslipPdf({
      company: slip.run.company,
      period: slip.run.period,
      status: slip.run.status,
      employee: slip.employee,
      regularEarnings: slip.regularEarnings != null ? Number(slip.regularEarnings) : null,
      grossPay: Number(slip.grossPay),
      taxablePay: Number(slip.taxablePay),
      netPay: Number(slip.netPay),
      lines: slip.lines.map((l: any) => ({
        label: l.label,
        kind: l.kind,
        amount: Number(l.amount),
        employerAmount: l.employerAmount ? Number(l.employerAmount) : null,
      })),
    });

    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="payslip-${slip.employee.staffNo}-${slip.run.period}.pdf"`,
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
