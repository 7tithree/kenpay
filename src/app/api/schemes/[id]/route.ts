import { prisma } from "@/lib/db";
import { requireCompany, ApiError } from "@/lib/auth";
import { handler, json } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { schemeSchema } from "../schema";

export const PATCH = handler(async (req, { params }) => {
  const { companyId } = await requireCompany(PERMISSIONS.RATES_EDIT);
  const body = schemeSchema.partial().parse(await json(req));
  const existing = await prisma.scheme.findFirst({ where: { id: params.id, companyId } });
  if (!existing) throw new ApiError(404, "Scheme not found");
  return prisma.scheme.update({ where: { id: params.id }, data: body });
});

export const DELETE = handler(async (_req, { params }) => {
  const { companyId } = await requireCompany(PERMISSIONS.RATES_EDIT);
  const existing = await prisma.scheme.findFirst({ where: { id: params.id, companyId } });
  if (!existing) throw new ApiError(404, "Scheme not found");
  await prisma.scheme.delete({ where: { id: params.id } });
  return { deleted: true };
});
