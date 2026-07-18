import { prisma } from "@/lib/db";
import { requireCompany, ApiError } from "@/lib/auth";
import { handler, json } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { employeeSchema } from "../schema";

export const GET = handler(async (_req, { params }) => {
  const { companyId } = await requireCompany(PERMISSIONS.EMPLOYEE_VIEW);
  const e = await prisma.employee.findFirst({
    where: { id: params.id, companyId },
    include: { salaryHistory: { orderBy: { effectiveFrom: "desc" } }, employmentType: true, exemptions: true, schemeMembers: true },
  });
  if (!e) throw new ApiError(404, "Employee not found");
  return e;
});

export const PATCH = handler(async (req, { params }) => {
  const body = employeeSchema.partial().parse(await json(req));
  // Status changes need employee.status; other edits need employee.edit
  const needed = Object.keys(body).length === 1 && body.status ? PERMISSIONS.EMPLOYEE_STATUS : PERMISSIONS.EMPLOYEE_EDIT;
  const { companyId } = await requireCompany(needed);
  const e = await prisma.employee.findFirst({ where: { id: params.id, companyId } });
  if (!e) throw new ApiError(404, "Employee not found");
  return prisma.employee.update({ where: { id: params.id }, data: body });
});

export const DELETE = handler(async (_req, { params }) => {
  const { companyId } = await requireCompany(PERMISSIONS.EMPLOYEE_DELETE);
  const e = await prisma.employee.findFirst({ where: { id: params.id, companyId } });
  if (!e) throw new ApiError(404, "Employee not found");
  await prisma.employee.delete({ where: { id: params.id } });
  return { deleted: true };
});
