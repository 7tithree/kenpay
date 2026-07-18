import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCompany, ApiError } from "@/lib/auth";
import { handler, json } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";

// Auth routes read cookies, so they can never be statically rendered.
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const { companyId } = await requireCompany(PERMISSIONS.REPORTS_VIEW);
  return prisma.whtRate.findMany({ where: { companyId }, orderBy: { category: "asc" } });
});

const schema = z.object({ category: z.string().min(1), resident: z.boolean().default(true), rate: z.number().nonnegative() });

export const POST = handler(async (req) => {
  const { companyId } = await requireCompany(PERMISSIONS.RATES_EDIT);
  const body = schema.parse(await json(req));
  return prisma.whtRate.upsert({
    where: { companyId_category_resident: { companyId, category: body.category, resident: body.resident } },
    update: { rate: body.rate },
    create: { companyId, ...body },
  });
});

export const DELETE = handler(async (req) => {
  const { companyId } = await requireCompany(PERMISSIONS.RATES_EDIT);
  const { id } = z.object({ id: z.string() }).parse(await json(req));
  const rec = await prisma.whtRate.findFirst({ where: { id, companyId } });
  if (!rec) throw new ApiError(404, "WHT rate not found");
  await prisma.whtRate.delete({ where: { id } });
  return { deleted: true };
});
