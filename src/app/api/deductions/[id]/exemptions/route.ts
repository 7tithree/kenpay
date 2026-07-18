import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCompany, ApiError } from "@/lib/auth";
import { handler, json } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";

// Exempt an employee from this deduction (payroll exemptions)
export const POST = handler(async (req, { params }) => {
  const { companyId } = await requireCompany(PERMISSIONS.EXEMPTIONS_MANAGE);
  const { employeeId, reason } = z
    .object({ employeeId: z.string(), reason: z.string().optional() })
    .parse(await json(req));
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, companyId } });
  if (!employee) throw new ApiError(404, "Employee not found in this company");
  return prisma.deductionExemption.create({
    data: { deductionId: params.id, employeeId, reason },
  });
});

export const DELETE = handler(async (req, { params }) => {
  const { companyId } = await requireCompany(PERMISSIONS.EXEMPTIONS_MANAGE);
  const { employeeId } = z.object({ employeeId: z.string() }).parse(await json(req));
  await prisma.deductionExemption.deleteMany({
    where: { deductionId: params.id, employeeId, deduction: { companyId } },
  });
  return { deleted: true };
});
