import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCompany, ApiError } from "@/lib/auth";
import { handler, json } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";

// Auth routes read cookies, so they can never be statically rendered.
export const dynamic = "force-dynamic";

// ?employeeId=... -> that employee's salary history
export const GET = handler(async (req) => {
  const { companyId } = await requireCompany(PERMISSIONS.SALARY_HISTORY);
  const employeeId = new URL(req.url).searchParams.get("employeeId");
  if (!employeeId) throw new ApiError(400, "employeeId is required");
  return prisma.salaryRecord.findMany({
    where: { employeeId, employee: { companyId } },
    orderBy: { effectiveFrom: "desc" },
  });
});

const schema = z.object({
  employeeId: z.string(),
  basicPay: z.number().nonnegative(),
  effectiveFrom: z.string().transform((s) => new Date(s)),
  note: z.string().optional(),
});

// Add a new salary rate (also updates the employee's current basicPay if latest)
export const POST = handler(async (req) => {
  const { companyId } = await requireCompany(PERMISSIONS.SALARY_ADD);
  const body = schema.parse(await json(req));
  const employee = await prisma.employee.findFirst({ where: { id: body.employeeId, companyId } });
  if (!employee) throw new ApiError(404, "Employee not found");
  const record = await prisma.salaryRecord.create({ data: body });
  if (body.effectiveFrom <= new Date()) {
    await prisma.employee.update({ where: { id: employee.id }, data: { basicPay: body.basicPay } });
  }
  return record;
});
