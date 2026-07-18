import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCompany, ApiError } from "@/lib/auth";
import { handler, json } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";

// Enrol an employee into a scheme (optionally with their own rate/amount),
// or enrol all non-terminated employees at once with { all: true }
export const POST = handler(async (req, { params }) => {
  const { companyId } = await requireCompany(PERMISSIONS.ACCESS_PENSION_RATES);
  const body = z
    .object({
      employeeId: z.string().optional(),
      ownRate: z.number().nonnegative().nullable().optional(),
      all: z.boolean().optional(),
    })
    .refine((b) => b.all || b.employeeId, { message: "employeeId or all is required" })
    .parse(await json(req));

  const scheme = await prisma.scheme.findFirst({ where: { id: params.id, companyId } });
  if (!scheme) throw new ApiError(404, "Scheme not found in this company");

  if (body.all) {
    const employees = await prisma.employee.findMany({
      where: { companyId, status: { not: "TERMINATED" } },
      select: { id: true },
    });
    const result = await prisma.schemeMember.createMany({
      data: employees.map((e) => ({ schemeId: params.id, employeeId: e.id })),
      skipDuplicates: true,
    });
    return { enrolled: result.count };
  }

  const employee = await prisma.employee.findFirst({ where: { id: body.employeeId, companyId } });
  if (!employee) throw new ApiError(404, "Employee not found in this company");
  return prisma.schemeMember.upsert({
    where: { schemeId_employeeId: { schemeId: params.id, employeeId: employee.id } },
    update: { ownRate: body.ownRate },
    create: { schemeId: params.id, employeeId: employee.id, ownRate: body.ownRate },
  });
});

export const DELETE = handler(async (req, { params }) => {
  const { companyId } = await requireCompany(PERMISSIONS.ACCESS_PENSION_RATES);
  const { employeeId } = z.object({ employeeId: z.string() }).parse(await json(req));
  await prisma.schemeMember.deleteMany({
    where: { schemeId: params.id, employeeId, scheme: { companyId } },
  });
  return { deleted: true };
});
