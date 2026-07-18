import { prisma } from "@/lib/db";
import { requireCompany } from "@/lib/auth";
import { handler, json } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { employeeSchema } from "./schema";

// Auth routes read cookies, so they can never be statically rendered.
export const dynamic = "force-dynamic";

export const GET = handler(async (req) => {
  const { membership, companyId } = await requireCompany(PERMISSIONS.EMPLOYEE_VIEW);
  // "Access salary rates" (general permission) gates seeing pay amounts
  const canSeePay = membership.role.permissions.includes(PERMISSIONS.ACCESS_SALARY_RATES);
  const url = new URL(req.url);
  const exportCsv = url.searchParams.get("export") === "csv";
  const employees = await prisma.employee.findMany({
    where: { companyId },
    include: { employmentType: true, branch: true },
    orderBy: { staffNo: "asc" },
  });
  if (exportCsv) {
    // export details requires its own permission
    await requireCompany(PERMISSIONS.EMPLOYEE_EXPORT);
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const header = "Staff No.,Name,Designation,Branch,ID/PASSPORT NO.,NSSF NO.,SHIF NO.,PIN,Account No.,Bank Name,Bank code,Bank Branch,Branch Code,Email";
    const rows = employees.map((e: (typeof employees)[number]) =>
      [e.staffNo, `${e.firstName} ${e.lastName}`, e.designation ?? "", e.branch?.name ?? "",
       e.nationalId ?? "", e.nssfNo ?? "", e.shifNo ?? "", e.kraPin ?? "", e.bankAccountNo ?? "",
       e.bankName ?? "", e.bankCode ?? "", e.bankBranch ?? "", e.bankBranchCode ?? "", e.email ?? ""]
        .map(esc).join(",")
    );
    return { csv: [header, ...rows].join("\n") };
  }
  return employees.map((e: (typeof employees)[number]) => (canSeePay ? e : { ...e, basicPay: null }));
});

export const POST = handler(async (req) => {
  const { companyId } = await requireCompany(PERMISSIONS.EMPLOYEE_ADD);
  const body = employeeSchema.parse(await json(req));
  return prisma.employee.create({
    data: {
      companyId,
      ...body,
      salaryHistory: { create: { basicPay: body.basicPay, effectiveFrom: new Date(), note: "Initial salary" } },
    },
  });
});
