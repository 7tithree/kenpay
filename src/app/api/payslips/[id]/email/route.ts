import { prisma } from "@/lib/db";
import { requireCompany, ApiError } from "@/lib/auth";
import { handler } from "@/lib/api";
import { buildPayslipPdf } from "@/lib/payslip-pdf";
import { sendPayslipEmail } from "@/lib/mailer";
import { logAudit } from "@/lib/audit";

// POST /api/payslips/:id/email — email the payslip PDF to the employee.
export const POST = handler(async (_req, { params }: { params: { id: string } }) => {
  const { session, companyId } = await requireCompany("payslip.email");
  const slip = await prisma.payslip.findFirst({
    where: { id: params.id, run: { companyId } },
    include: { run: { include: { company: true } }, employee: true, lines: true },
  });
  if (!slip) throw new ApiError(404, "Payslip not found");
  if (!slip.employee.email) {
    throw new ApiError(422, `${slip.employee.firstName} ${slip.employee.lastName} has no email address on file`);
  }

  const pdf = await buildPayslipPdf({
    company: slip.run.company,
    period: slip.run.period,
    status: slip.run.status,
    employee: slip.employee,
    regularEarnings: slip.regularEarnings != null ? Number(slip.regularEarnings) : null,
    grossPay: Number(slip.grossPay),
    taxablePay: Number(slip.taxablePay),
    netPay: Number(slip.netPay),
    lines: slip.lines.map((l: typeof slip.lines[0]) => ({
      label: l.label,
      kind: l.kind,
      amount: Number(l.amount),
      employerAmount: l.employerAmount ? Number(l.employerAmount) : null,
    })),
  });

  await sendPayslipEmail({
    to: slip.employee.email,
    companyName: slip.run.company.name,
    period: slip.run.period,
    employeeName: `${slip.employee.firstName} ${slip.employee.lastName}`,
    pdf,
  });

  await logAudit({
    userId: session.userId,
    companyId,
    action: "payslip.email",
    detail: { payslipId: slip.id, to: slip.employee.email, period: slip.run.period },
  });

  return { sent: true, to: slip.employee.email };
});
