import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCompany, ApiError } from "@/lib/auth";
import { handler, json } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";

export const PATCH = handler(async (req, { params }) => {
  const { companyId } = await requireCompany(PERMISSIONS.EMPTYPE_EDIT);
  const { name } = z.object({ name: z.string().min(1) }).parse(await json(req));
  const t = await prisma.employmentType.findFirst({ where: { id: params.id, companyId } });
  if (!t) throw new ApiError(404, "Employment type not found");
  return prisma.employmentType.update({ where: { id: params.id }, data: { name } });
});

export const DELETE = handler(async (_req, { params }) => {
  const { companyId } = await requireCompany(PERMISSIONS.EMPTYPE_DELETE);
  const t = await prisma.employmentType.findFirst({ where: { id: params.id, companyId } });
  if (!t) throw new ApiError(404, "Employment type not found");
  await prisma.employmentType.delete({ where: { id: params.id } });
  return { deleted: true };
});
