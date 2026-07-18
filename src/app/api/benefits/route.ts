import { prisma } from "@/lib/db";
import { requireCompany } from "@/lib/auth";
import { handler, json } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { benefitSchema } from "./schema";

// Auth routes read cookies, so they can never be statically rendered.
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const { companyId } = await requireCompany(PERMISSIONS.BENEFIT_VIEW);
  return prisma.benefit.findMany({
    where: { companyId },
    include: { recipients: { include: { employee: true } } },
    orderBy: { createdAt: "asc" },
  });
});

export const POST = handler(async (req) => {
  const { companyId } = await requireCompany(PERMISSIONS.BENEFIT_CREATE);
  const body = benefitSchema.parse(await json(req));
  return prisma.benefit.create({ data: { companyId, ...body } });
});
