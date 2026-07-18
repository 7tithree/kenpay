import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCompany, ApiError } from "@/lib/auth";
import { handler, json } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";

const schema = z.object({
  basicPay: z.number().nonnegative().optional(),
  effectiveFrom: z.string().transform((s) => new Date(s)).optional(),
  note: z.string().optional(),
});

export const PATCH = handler(async (req, { params }) => {
  const { companyId } = await requireCompany(PERMISSIONS.SALARY_EDIT);
  const body = schema.parse(await json(req));
  const rec = await prisma.salaryRecord.findFirst({
    where: { id: params.id, employee: { companyId } },
  });
  if (!rec) throw new ApiError(404, "Salary record not found");
  return prisma.salaryRecord.update({ where: { id: params.id }, data: body });
});

export const DELETE = handler(async (_req, { params }) => {
  const { companyId } = await requireCompany(PERMISSIONS.SALARY_DELETE);
  const rec = await prisma.salaryRecord.findFirst({
    where: { id: params.id, employee: { companyId } },
  });
  if (!rec) throw new ApiError(404, "Salary record not found");
  await prisma.salaryRecord.delete({ where: { id: params.id } });
  return { deleted: true };
});
