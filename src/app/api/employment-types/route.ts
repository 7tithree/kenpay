import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCompany } from "@/lib/auth";
import { handler, json } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";

// Auth routes read cookies, so they can never be statically rendered.
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const { companyId } = await requireCompany(PERMISSIONS.EMPTYPE_VIEW);
  return prisma.employmentType.findMany({ where: { companyId } });
});

export const POST = handler(async (req) => {
  const { companyId } = await requireCompany(PERMISSIONS.EMPTYPE_CREATE);
  const { name } = z.object({ name: z.string().min(1) }).parse(await json(req));
  return prisma.employmentType.create({ data: { companyId, name } });
});
