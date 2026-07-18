import { prisma } from "@/lib/db";
import { requireCompany, ApiError } from "@/lib/auth";
import { handler, json } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { benefitSchema } from "../schema";

export const PATCH = handler(async (req, { params }) => {
  const { companyId } = await requireCompany(PERMISSIONS.BENEFIT_EDIT);
  const body = benefitSchema.partial().parse(await json(req));
  const existing = await prisma.benefit.findFirst({ where: { id: params.id, companyId } });
  if (!existing) throw new ApiError(404, "Benefit not found");
  return prisma.benefit.update({ where: { id: params.id }, data: body });
});

export const DELETE = handler(async (_req, { params }) => {
  const { companyId } = await requireCompany(PERMISSIONS.BENEFIT_DELETE);
  const existing = await prisma.benefit.findFirst({ where: { id: params.id, companyId } });
  if (!existing) throw new ApiError(404, "Benefit not found");
  await prisma.benefit.delete({ where: { id: params.id } });
  return { deleted: true };
});
