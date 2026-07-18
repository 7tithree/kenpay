import { prisma } from "@/lib/db";
import { requireCompany } from "@/lib/auth";
import { handler, json } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { schemeSchema } from "./schema";

// Auth routes read cookies, so they can never be statically rendered.
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const { companyId } = await requireCompany(PERMISSIONS.ACCESS_PENSION_RATES);
  return prisma.scheme.findMany({
    where: { companyId },
    include: { members: { include: { employee: true } } },
    orderBy: { createdAt: "asc" },
  });
});

export const POST = handler(async (req) => {
  const { companyId } = await requireCompany(PERMISSIONS.RATES_EDIT);
  const body = schemeSchema.parse(await json(req));
  return prisma.scheme.create({ data: { companyId, ...body } });
});
