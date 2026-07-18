import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCompany, ApiError } from "@/lib/auth";
import { handler, json } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";

// Assign an allowance to an employee (optionally with their own amount/rate)
export const POST = handler(async (req, { params }) => {
  const { companyId } = await requireCompany(PERMISSIONS.ALLOWANCE_EDIT);
  const { employeeId, ownRate } = z
    .object({ employeeId: z.string(), ownRate: z.number().nonnegative().nullable().optional() })
    .parse(await json(req));
  const allowance = await prisma.allowance.findFirst({ where: { id: params.id, companyId } });
  if (!allowance) throw new ApiError(404, "Allowance not found");
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, companyId } });
  if (!employee) throw new ApiError(404, "Employee not found in this company");
  return prisma.allowanceRecipient.upsert({
    where: { allowanceId_employeeId: { allowanceId: params.id, employeeId } },
    update: { ownRate },
    create: { allowanceId: params.id, employeeId, ownRate },
  });
});

export const DELETE = handler(async (req, { params }) => {
  const { companyId } = await requireCompany(PERMISSIONS.ALLOWANCE_EDIT);
  const { employeeId } = z.object({ employeeId: z.string() }).parse(await json(req));
  await prisma.allowanceRecipient.deleteMany({
    where: { allowanceId: params.id, employeeId, allowance: { companyId } },
  });
  return { deleted: true };
});
