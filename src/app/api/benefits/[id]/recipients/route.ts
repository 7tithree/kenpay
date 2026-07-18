import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCompany, ApiError } from "@/lib/auth";
import { handler, json } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";

// Assign a benefit to an employee (optionally with their own amount/rate)
export const POST = handler(async (req, { params }) => {
  const { companyId } = await requireCompany(PERMISSIONS.BENEFIT_EDIT);
  const { employeeId, ownRate } = z
    .object({ employeeId: z.string(), ownRate: z.number().nonnegative().nullable().optional() })
    .parse(await json(req));
  const benefit = await prisma.benefit.findFirst({ where: { id: params.id, companyId } });
  if (!benefit) throw new ApiError(404, "Benefit not found");
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, companyId } });
  if (!employee) throw new ApiError(404, "Employee not found in this company");
  return prisma.benefitRecipient.upsert({
    where: { benefitId_employeeId: { benefitId: params.id, employeeId } },
    update: { ownRate },
    create: { benefitId: params.id, employeeId, ownRate },
  });
});

export const DELETE = handler(async (req, { params }) => {
  const { companyId } = await requireCompany(PERMISSIONS.BENEFIT_EDIT);
  const { employeeId } = z.object({ employeeId: z.string() }).parse(await json(req));
  await prisma.benefitRecipient.deleteMany({
    where: { benefitId: params.id, employeeId, benefit: { companyId } },
  });
  return { deleted: true };
});
