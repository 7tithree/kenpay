import { prisma } from "@/lib/db";
import { requireCompany, ApiError } from "@/lib/auth";
import { handler } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { parsePayrollInputsCsv } from "@/lib/payroll-import";

/**
 * POST multipart/form-data: "file" (CSV) + "period" (e.g. 2026-07).
 *
 * Accepts anything from the minimal `staffNo,allowances,bonus` inputs file to
 * a full payroll register export. Recognised columns:
 * - Staff No. (required) — must match existing employees
 * - Basic pay — updates the employee's pay (+ salary history) when it differs
 * - columns matching company-defined allowances/benefits — auto-populate that
 *   employee's assignment with the amount (0/blank removes the assignment)
 * - Allowances — lump "other allowances" period input
 * - Bonus — one-off for the period, added directly at the taxable-pay step
 * Unrecognised columns (computed values, 13th Cheque…) are ignored and
 * reported back. Rows without a staff number (spacers, totals) are skipped.
 */
export const POST = handler(async (req) => {
  const { companyId } = await requireCompany(PERMISSIONS.PAYROLL_RUN);
  const form = await req.formData().catch(() => {
    throw new ApiError(400, "Expected multipart/form-data");
  });
  const file = form.get("file");
  const period = String(form.get("period") ?? "");
  if (!(file instanceof File)) throw new ApiError(400, "No CSV file uploaded");
  if (!/^\d{4}-\d{2}$/.test(period)) throw new ApiError(422, "period must look like 2026-07");

  const [employees, allowanceDefs, benefitDefs] = await Promise.all([
    prisma.employee.findMany({ where: { companyId } }),
    prisma.allowance.findMany({ where: { companyId } }),
    prisma.benefit.findMany({ where: { companyId } }),
  ]);
  const byStaffNo = new Map(employees.map((e) => [e.staffNo.trim(), e]));

  const parsed = parsePayrollInputsCsv(
    await file.text(),
    allowanceDefs.map((a) => ({ id: a.id, name: a.name })),
    benefitDefs.map((b) => ({ id: b.id, name: b.name }))
  );

  const failed = [...parsed.failed];
  const inputs: Record<string, { allowances: number; bonus: number }> = {};
  let payUpdated = 0;
  let assignmentsSet = 0;
  let assignmentsCleared = 0;

  await prisma.$transaction(async (tx) => {
    for (const row of parsed.rows) {
      const emp = byStaffNo.get(row.staffNo);
      if (!emp) {
        failed.push({ row: row.rowNo, error: `Unknown staffNo ${row.staffNo}` });
        continue;
      }

      if (row.basicPay != null && row.basicPay > 0 && row.basicPay !== Number(emp.basicPay)) {
        await tx.employee.update({ where: { id: emp.id }, data: { basicPay: row.basicPay } });
        await tx.salaryRecord.create({
          data: {
            employeeId: emp.id,
            basicPay: row.basicPay,
            effectiveFrom: new Date(`${period}-01T00:00:00Z`),
            note: "Payroll CSV import",
          },
        });
        payUpdated++;
      }

      for (const [allowanceId, amount] of Object.entries(row.allowanceAmounts)) {
        if (amount > 0) {
          await tx.allowanceRecipient.upsert({
            where: { allowanceId_employeeId: { allowanceId, employeeId: emp.id } },
            update: { ownRate: amount },
            create: { allowanceId, employeeId: emp.id, ownRate: amount },
          });
          assignmentsSet++;
        } else {
          const res = await tx.allowanceRecipient.deleteMany({
            where: { allowanceId, employeeId: emp.id },
          });
          assignmentsCleared += res.count;
        }
      }
      for (const [benefitId, amount] of Object.entries(row.benefitAmounts)) {
        if (amount > 0) {
          await tx.benefitRecipient.upsert({
            where: { benefitId_employeeId: { benefitId, employeeId: emp.id } },
            update: { ownRate: amount },
            create: { benefitId, employeeId: emp.id, ownRate: amount },
          });
          assignmentsSet++;
        } else {
          const res = await tx.benefitRecipient.deleteMany({
            where: { benefitId, employeeId: emp.id },
          });
          assignmentsCleared += res.count;
        }
      }

      inputs[emp.id] = { allowances: row.otherAllowances, bonus: row.bonus };
    }

    const company = await tx.company.findUnique({ where: { id: companyId } });
    const settings = (company?.settings as any) ?? {};
    settings.payrollInputs = { ...(settings.payrollInputs ?? {}), [period]: inputs };
    await tx.company.update({ where: { id: companyId }, data: { settings } });
  }, { timeout: 60000 });

  return {
    loaded: Object.keys(inputs).length,
    payUpdated,
    assignmentsSet,
    assignmentsCleared,
    matchedAllowanceCols: parsed.matchedAllowanceCols,
    matchedBenefitCols: parsed.matchedBenefitCols,
    ignoredColumns: parsed.ignoredColumns,
    warnings: parsed.warnings,
    failed,
  };
});
