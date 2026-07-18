import { prisma } from "@/lib/db";
import { requireCompany, ApiError } from "@/lib/auth";
import { handler, json } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { deductionSchema } from "../schema";
import { logAudit } from "@/lib/audit";

export const PATCH = handler(async (req, { params }) => {
  const { session, companyId } = await requireCompany(PERMISSIONS.RATES_EDIT);
  const body = deductionSchema.partial().parse(await json(req));
  const existing = await prisma.deduction.findFirst({ where: { id: params.id, companyId } });
  if (!existing) throw new ApiError(404, "Deduction not found");
  const updated = await prisma.deduction.update({
    where: { id: params.id },
    data: { ...body, tiers: body.tiers === null ? undefined : body.tiers },
  });
  await logAudit({
    userId: session.userId,
    companyId,
    action: "rates.edit",
    detail: { deduction: existing.name, changes: body },
  });
  return updated;
});

export const DELETE = handler(async (_req, { params }) => {
  const { companyId } = await requireCompany(PERMISSIONS.RATES_EDIT);
  const existing = await prisma.deduction.findFirst({ where: { id: params.id, companyId } });
  if (!existing) throw new ApiError(404, "Deduction not found");
  if (existing.statutory) {
    // Statutory items are deactivated, not deleted, to preserve history
    return prisma.deduction.update({ where: { id: params.id }, data: { active: false } });
  }
  await prisma.deduction.delete({ where: { id: params.id } });
  return { deleted: true };
});
