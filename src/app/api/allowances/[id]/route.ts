import { prisma } from "@/lib/db";
import { requireCompany, ApiError } from "@/lib/auth";
import { handler, json } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { allowanceSchema } from "../schema";

export const PATCH = handler(async (req, { params }) => {
  const { companyId } = await requireCompany(PERMISSIONS.ALLOWANCE_EDIT);
  const body = allowanceSchema.partial().parse(await json(req));
  const existing = await prisma.allowance.findFirst({ where: { id: params.id, companyId } });
  if (!existing) throw new ApiError(404, "Allowance not found");
  return prisma.allowance.update({ where: { id: params.id }, data: body });
});

export const DELETE = handler(async (_req, { params }) => {
  const { companyId } = await requireCompany(PERMISSIONS.ALLOWANCE_DELETE);
  const existing = await prisma.allowance.findFirst({ where: { id: params.id, companyId } });
  if (!existing) throw new ApiError(404, "Allowance not found");
  await prisma.allowance.delete({ where: { id: params.id } });
  return { deleted: true };
});
