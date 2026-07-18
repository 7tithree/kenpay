import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCompany, ApiError } from "@/lib/auth";
import { handler, json } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { calculatePayslip, computeEarning, type EngineDeduction } from "@/lib/payroll-engine";
import { logAudit } from "@/lib/audit";

// Auth routes read cookies, so they can never be statically rendered.
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const { companyId } = await requireCompany(PERMISSIONS.PAYROLL_VIEW);
  return prisma.payrollRun.findMany({
    where: { companyId },
    include: { payslips: { include: { employee: true, lines: true } } },
    orderBy: { createdAt: "desc" },
  });
});

const toNum = (v: any) => (v == null ? null : Number(v));

export const POST = handler(async (req) => {
  const { companyId, session } = await requireCompany(PERMISSIONS.PAYROLL_RUN);
  const { period } = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) }).parse(await json(req));

  const existing = await prisma.payrollRun.findUnique({
    where: { companyId_period: { companyId, period } },
  });
  if (existing && existing.status !== "CANCELLED")
    throw new ApiError(409, `A ${existing.status.toLowerCase()} run already exists for ${period}`);

  const [employees, deductions, company] = await Promise.all([
    prisma.employee.findMany({
      where: { companyId, status: "ACTIVE" },
      include: {
        exemptions: true,
        schemeMembers: { include: { scheme: true } },
        allowances: { include: { allowance: true } },
        benefits: { include: { benefit: true } },
      },
    }),
    prisma.deduction.findMany({ where: { companyId, active: true } }),
    prisma.company.findUnique({ where: { id: companyId } }),
  ]);
  if (!employees.length) throw new ApiError(422, "No active employees to run payroll for");

  const inputs = ((company?.settings as any)?.payrollInputs ?? {})[period] ?? {};

  const run = await prisma.$transaction(async (tx: any) => {
    if (existing) await tx.payrollRun.delete({ where: { id: existing.id } });
    const run = await tx.payrollRun.create({
      data: { companyId, period, runBy: session.userId },
    });
    for (const emp of employees) {
      const exemptIds = new Set(emp.exemptions.map((x: any) => x.deductionId));
      const engineDeductions: EngineDeduction[] = deductions
        .filter((d: any) => !exemptIds.has(d.id))
        .map((d: any) => ({
          id: d.id, name: d.name, method: d.method, point: d.point,
          rate: toNum(d.rate), capAmount: toNum(d.capAmount), minAmount: toNum(d.minAmount),
          relief: toNum(d.relief), employerRate: toNum(d.employerRate),
          preTax: d.preTax, tiers: (d.tiers as any) ?? null,
        }));
      const engineSchemes: EngineDeduction[] = emp.schemeMembers
        .filter((m: any) => m.scheme.active)
        .map((m: any) => ({
          id: m.scheme.id, name: m.scheme.name, method: m.scheme.method, point: m.scheme.point,
          rate: toNum(m.scheme.rate), capAmount: toNum(m.scheme.capAmount),
          employerRate: toNum(m.scheme.employerRate), preTax: m.scheme.preTax,
          ownRate: toNum(m.ownRate),
        }));

      const basicPay = Number(emp.basicPay);
      // Company-defined allowances/benefits assigned to this employee
      const allowanceLines = emp.allowances
        .filter((r: any) => r.allowance.active)
        .map((r: any) => ({
          label: r.allowance.name,
          amount: computeEarning(
            { id: r.allowance.id, name: r.allowance.name, method: r.allowance.method,
              rate: toNum(r.allowance.rate), ownRate: toNum(r.ownRate) },
            basicPay
          ),
        }))
        .filter((l: any) => l.amount > 0);
      const benefitLines = emp.benefits
        .filter((r: any) => r.benefit.active)
        .map((r: any) => ({
          label: r.benefit.name,
          amount: computeEarning(
            { id: r.benefit.id, name: r.benefit.name, method: r.benefit.method,
              rate: toNum(r.benefit.rate), ownRate: toNum(r.ownRate) },
            basicPay
          ),
        }))
        .filter((l: any) => l.amount > 0);

      const otherAllowances = inputs[emp.id]?.allowances ?? 0; // period CSV input
      const allowancesTotal = allowanceLines.reduce((s: number, l: any) => s + l.amount, 0) + otherAllowances;
      const benefitsTotal = benefitLines.reduce((s: number, l: any) => s + l.amount, 0);
      const bonus = inputs[emp.id]?.bonus ?? 0; // one-off for this period (CSV input)

      const result = calculatePayslip({
        basicPay,
        allowances: allowancesTotal,
        benefits: benefitsTotal,
        bonus,
        deductions: engineDeductions,
        schemes: engineSchemes,
      });

      await tx.payslip.create({
        data: {
          runId: run.id,
          employeeId: emp.id,
          grossPay: result.grossPay,
          taxablePay: result.taxablePay,
          netPay: result.netPay,
          lines: {
            create: [
              { label: "Basic pay", kind: "EARNING", amount: emp.basicPay },
              ...allowanceLines.map((l: any) => ({ label: l.label, kind: "EARNING", amount: l.amount })),
              ...(otherAllowances
                ? [{ label: "Other allowances", kind: "EARNING", amount: otherAllowances }]
                : []),
              ...(bonus ? [{ label: "Bonus", kind: "EARNING", amount: bonus }] : []),
              ...benefitLines.map((l: any) => ({ label: l.label, kind: "BENEFIT", amount: l.amount })),
              ...result.lines.map((l) => ({
                label: l.name, kind: l.kind, amount: l.amount,
                employerAmount: l.employerAmount || null,
              })),
            ],
          },
        },
      });
    }
    return run;
  }, { timeout: 60000 });

  await logAudit({
    userId: session.userId,
    companyId,
    action: "payroll.run",
    detail: { period, employees: employees.length },
  });

  return prisma.payrollRun.findUnique({
    where: { id: run.id },
    include: { payslips: { include: { employee: true, lines: true } } },
  });
});

// PATCH { runId, action: "certify" | "approve" | "cancel" }
export const PATCH = handler(async (req) => {
  const { runId, action } = z
    .object({ runId: z.string(), action: z.enum(["certify", "approve", "cancel"]) })
    .parse(await json(req));
  const perm = {
    certify: PERMISSIONS.PAYROLL_CERTIFY,
    approve: PERMISSIONS.PAYROLL_APPROVE,
    cancel: PERMISSIONS.PAYROLL_CANCEL,
  }[action];
  const { companyId, session } = await requireCompany(perm);
  const run = await prisma.payrollRun.findFirst({ where: { id: runId, companyId } });
  if (!run) throw new ApiError(404, "Payroll run not found");

  const allowed: Record<string, string[]> = {
    certify: ["DRAFT"],
    approve: ["CERTIFIED"],
    cancel: ["DRAFT", "CERTIFIED"],
  };
  if (!allowed[action].includes(run.status))
    throw new ApiError(409, `Cannot ${action} a ${run.status.toLowerCase()} run`);

  const status = { certify: "CERTIFIED", approve: "APPROVED", cancel: "CANCELLED" }[action] as any;
  const updated = await prisma.payrollRun.update({ where: { id: runId }, data: { status } });
  await logAudit({
    userId: session.userId,
    companyId,
    action: `payroll.${action}`,
    detail: { period: run.period },
  });
  return updated;
});
