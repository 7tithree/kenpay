import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCompany } from "@/lib/auth";
import { handler, json } from "@/lib/api";
import { PERMISSIONS, ALL_PERMISSIONS } from "@/lib/permissions";

// Auth routes read cookies, so they can never be statically rendered.
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const { companyId } = await requireCompany(PERMISSIONS.COMPANY_VIEW);
  const roles = await prisma.role.findMany({ where: { companyId } });
  return { roles, availablePermissions: ALL_PERMISSIONS };
});

const schema = z.object({
  name: z.string().min(2),
  permissions: z.array(z.string()),
});

export const POST = handler(async (req) => {
  const { companyId } = await requireCompany(PERMISSIONS.COMPANY_ASSIGN_ROLES);
  const body = schema.parse(await json(req));
  return prisma.role.create({ data: { companyId, ...body } });
});
