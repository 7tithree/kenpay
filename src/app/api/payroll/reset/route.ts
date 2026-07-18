import { prisma } from "@/lib/db";
import { requireCompany } from "@/lib/auth";
import { handler } from "@/lib/api";
import { KENYA_DEFAULT_DEDUCTIONS, KENYA_DEFAULT_WHT } from "@/lib/payroll-engine";
import { logAudit } from "@/lib/audit";

/**
 * POST /api/payroll/reset — "Reset payroll settings" (general permission).
 * Restores the company's payroll configuration to the statutory defaults:
 *  - statutory deductions (PAYE, NSSF, SHIF, Housing Levy) reset to default
 *    rates/tiers and re-created if they were deleted or deactivated
 *  - custom (non-statutory) deductions are deactivated (never deleted, so
 *    historic payslips keep their references)
 *  - WHT rates reset to the statutory table
 *  - pending imported payroll inputs are cleared
 * Approved/certified runs and payslips are left untouched.
 */
export const POST = handler(async () => {
  const { session, companyId } = await requireCompany("general.reset_payroll");

  const result = await prisma.$transaction(async (tx: any) => {
    // 1. Deactivate custom deductions
    const custom = await tx.deduction.updateMany({
      where: { companyId, statutory: false },
      data: { active: false },
    });

    // 2. Restore statutory deductions to defaults (upsert by name)
    for (const d of KENYA_DEFAULT_DEDUCTIONS) {
      const data = {
        statutory: d.statutory,
        method: d.method as any,
        point: d.point as any,
        rate: (d as any).rate ?? null,
        capAmount: (d as any).capAmount ?? null,
        relief: (d as any).relief ?? null,
        employerRate: (d as any).employerRate ?? null,
        preTax: d.preTax,
        tiers: (d as any).tiers ?? undefined,
        active: true,
      };
      const existing = await tx.deduction.findFirst({ where: { companyId, name: d.name } });
      if (existing) {
        await tx.deduction.update({ where: { id: existing.id }, data });
      } else {
        await tx.deduction.create({ data: { ...data, companyId, name: d.name } });
      }
    }

    // 3. Reset WHT rates
    await tx.whtRate.deleteMany({ where: { companyId } });
    await tx.whtRate.createMany({
      data: KENYA_DEFAULT_WHT.map((w) => ({ ...w, companyId })),
    });

    // 4. Clear pending payroll inputs stored in company settings
    const company = await tx.company.findUnique({ where: { id: companyId } });
    const settings = (company?.settings as any) ?? {};
    delete settings.payrollInputs;
    await tx.company.update({ where: { id: companyId }, data: { settings } });

    return { customDeactivated: custom.count };
  });

  await logAudit({
    userId: session.userId,
    companyId,
    action: "payroll.reset",
    detail: result,
  });

  return {
    ...result,
    message:
      "Payroll settings reset: statutory rates restored to defaults, custom deductions deactivated, WHT rates restored, pending payroll inputs cleared.",
  };
});
