import Papa from "papaparse";
import { prisma } from "@/lib/db";
import { requireCompany, ApiError } from "@/lib/auth";
import { handler } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";

/**
 * POST multipart/form-data: "file" (CSV) + "period" (e.g. 2026-07).
 * Headers: staffNo,allowances,bonus (allowances and bonus optional, default 0)
 * Stores per-employee payroll inputs for the period in company settings,
 * consumed by the payroll run. Bonus is a one-off for the period: it is added
 * directly at the taxable-pay step of the calculation.
 */
export const POST = handler(async (req) => {
  const { companyId } = await requireCompany(PERMISSIONS.PAYROLL_RUN);
  const form = await req.formData().catch(() => {
    throw new ApiError(400, "Expected multipart/form-data");
  });
  const file = form.get("file");
  const period = String(form.get("period") ?? "");
  if (!(file instanceof File)) throw new ApiError(400, "No CSV file uploaded");
  if (!/^\d{4}-\d{2}$/.test(period)) throw new ApiError(422, "period must look like 2026-07");

  // Headers are matched case/punctuation-insensitively; unrecognised columns
  // are ignored (only the mapped fields are ever read).
  const HEADER_MAP: Record<string, string> = {
    staffno: "staffNo",
    allowances: "allowances",
    allowance: "allowances",
    bonus: "bonus",
    bonuses: "bonus",
  };
  const normalizeHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");
  const parsed = Papa.parse<Record<string, string>>(await file.text(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => HEADER_MAP[normalizeHeader(h)] ?? h.trim(),
  });

  const employees = await prisma.employee.findMany({ where: { companyId } });
  const byStaffNo = new Map(employees.map((e: typeof employees[number]) => [e.staffNo, e.id]));

  const inputs: Record<string, { allowances: number; bonus: number }> = {};
  const failed: { row: number; error: string }[] = [];
  parsed.data.forEach((row, i) => {
    const id = byStaffNo.get(String(row.staffNo ?? "")) as string | undefined;
    const allowances = Number(row.allowances ?? 0);
    const bonus = Number(row.bonus ?? 0);
    if (!id) failed.push({ row: i + 2, error: `Unknown staffNo ${row.staffNo}` });
    else if (Number.isNaN(allowances) || allowances < 0)
      failed.push({ row: i + 2, error: "allowances must be a non-negative number" });
    else if (Number.isNaN(bonus) || bonus < 0)
      failed.push({ row: i + 2, error: "bonus must be a non-negative number" });
    else inputs[id] = { allowances, bonus };
  });

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  const settings = (company?.settings as any) ?? {};
  settings.payrollInputs = { ...(settings.payrollInputs ?? {}), [period]: inputs };
  await prisma.company.update({ where: { id: companyId }, data: { settings } });

  return { loaded: Object.keys(inputs).length, failed };
});
