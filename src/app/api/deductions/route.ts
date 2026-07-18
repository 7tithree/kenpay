import { prisma } from "@/lib/db";
import { requireCompany } from "@/lib/auth";
import { handler, json } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { deductionSchema } from "./schema";

// Auth routes read cookies, so they can never be statically rendered.
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const { companyId } = await requireCompany(PERMISSIONS.PAYROLL_VIEW);
  return prisma.deduction.findMany({
    where: { companyId },
    include: { exemptions: { include: { employee: true } } },
    orderBy: { createdAt: "asc" },
  });
});

export const POST = handler(async (req) => {
  const { companyId } = await requireCompany(PERMISSIONS.RATES_EDIT);
  const body = deductionSchema.parse(await json(req));
  return prisma.deduction.create({ data: { companyId, ...body, tiers: body.tiers ?? undefined } });
});
