import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCompany } from "@/lib/auth";
import { handler, json } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";

// Auth routes read cookies, so they can never be statically rendered.
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const { companyId } = await requireCompany(PERMISSIONS.COMPANY_VIEW);
  return prisma.company.findUnique({
    where: { id: companyId },
    include: { branches: true, roles: true },
  });
});

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  kraPin: z.string().optional(),
  address: z.string().optional(),
  settings: z.record(z.string(), z.any()).optional(),
});

export const PATCH = handler(async (req) => {
  const { companyId } = await requireCompany(PERMISSIONS.COMPANY_EDIT);
  const body = patchSchema.parse(await json(req));
  return prisma.company.update({ where: { id: companyId }, data: body });
});

export const DELETE = handler(async () => {
  const { companyId } = await requireCompany(PERMISSIONS.COMPANY_DELETE);
  await prisma.company.delete({ where: { id: companyId } });
  return { deleted: true };
});
