import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCompany, ApiError } from "@/lib/auth";
import { handler, json } from "@/lib/api";
import { logAudit } from "@/lib/audit";

// Auth routes read cookies, so they can never be statically rendered.
export const dynamic = "force-dynamic";

// GET /api/branches — list branches (with employee counts)
export const GET = handler(async () => {
  const { companyId } = await requireCompany("company.view");
  return prisma.branch.findMany({
    where: { companyId },
    include: { _count: { select: { employees: true } } },
    orderBy: { name: "asc" },
  });
});

const schema = z.object({
  name: z.string().min(1),
  location: z.string().optional(),
});

// POST — create a branch
export const POST = handler(async (req) => {
  const { session, companyId } = await requireCompany("company.edit");
  const body = schema.parse(await json(req));
  const branch = await prisma.branch.create({ data: { ...body, companyId } });
  await logAudit({ userId: session.userId, companyId, action: "branch.add", detail: { name: body.name } });
  return branch;
});

// PATCH /api/branches?id=... — rename / relocate
export const PATCH = handler(async (req) => {
  const { session, companyId } = await requireCompany("company.edit");
  const id = new URL(req.url).searchParams.get("id");
  if (!id) throw new ApiError(400, "id is required");
  const body = schema.partial().parse(await json(req));
  const existing = await prisma.branch.findFirst({ where: { id, companyId } });
  if (!existing) throw new ApiError(404, "Branch not found");
  const branch = await prisma.branch.update({ where: { id }, data: body });
  await logAudit({ userId: session.userId, companyId, action: "branch.edit", detail: { id, ...body } });
  return branch;
});

// DELETE /api/branches?id=... — employees keep working, just unassigned
export const DELETE = handler(async (req) => {
  const { session, companyId } = await requireCompany("company.edit");
  const id = new URL(req.url).searchParams.get("id");
  if (!id) throw new ApiError(400, "id is required");
  const existing = await prisma.branch.findFirst({ where: { id, companyId } });
  if (!existing) throw new ApiError(404, "Branch not found");
  await prisma.$transaction([
    prisma.employee.updateMany({ where: { branchId: id }, data: { branchId: null } }),
    prisma.branch.delete({ where: { id } }),
  ]);
  await logAudit({ userId: session.userId, companyId, action: "branch.delete", detail: { id, name: existing.name } });
  return { deleted: true };
});
