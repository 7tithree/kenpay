import Papa from "papaparse";
import { prisma } from "@/lib/db";
import { requireCompany, ApiError } from "@/lib/auth";
import { handler } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { employeeSchema } from "../schema";

/**
 * POST multipart/form-data with a "file" field (CSV) and an optional
 * "employmentTypeId" field applied to every imported row.
 *
 * Expected headers (matched case/punctuation-insensitively, extra columns ignored):
 * Staff No., Name, Designation, Branch, ID/PASSPORT NO., NSSF NO., SHIF NO.,
 * PIN, Account No., Bank Name, Bank code, Bank Branch, Branch Code, Email
 *
 * "Name" is split on the first space into first and last name. Rows are
 * validated individually; the response reports per-row failures.
 */

// Canonical field <- normalized header (lowercased, non-alphanumerics stripped)
const HEADER_MAP: Record<string, string> = {
  staffno: "staffNo",
  name: "name",
  designation: "designation",
  branch: "branch",
  idpassportno: "nationalId",
  idpassport: "nationalId",
  nationalid: "nationalId",
  nssfno: "nssfNo",
  shifno: "shifNo",
  pin: "kraPin",
  krapin: "kraPin",
  accountno: "bankAccountNo",
  bankname: "bankName",
  bankcode: "bankCode",
  bankbranch: "bankBranch",
  branchcode: "bankBranchCode",
  email: "email",
};

const normalizeHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

// basicPay is not part of the CSV — new employees start at 0 and are rated later
const importSchema = employeeSchema.omit({ basicPay: true });

export const POST = handler(async (req) => {
  const { companyId } = await requireCompany(PERMISSIONS.EMPLOYEE_IMPORT);
  const form = await req.formData().catch(() => {
    throw new ApiError(400, "Expected multipart/form-data with a 'file' field");
  });
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "No CSV file uploaded");
  if (file.size > 5 * 1024 * 1024) throw new ApiError(413, "CSV too large (max 5MB)");

  // Employment type is chosen at upload time and applied to every row
  const employmentTypeField = form.get("employmentTypeId");
  let employmentTypeId: string | null = null;
  if (typeof employmentTypeField === "string" && employmentTypeField) {
    const type = await prisma.employmentType.findFirst({
      where: { id: employmentTypeField, companyId },
    });
    if (!type) throw new ApiError(400, "Unknown employment type");
    employmentTypeId = type.id;
  }

  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => HEADER_MAP[normalizeHeader(h)] ?? h.trim(),
  });
  // FieldMismatch (row shorter/longer than the header) is tolerated: unknown
  // columns are ignored and missing trailing fields are treated as blank.
  const fatal = parsed.errors.filter((e) => e.type !== "FieldMismatch");
  if (fatal.length) {
    throw new ApiError(422, `CSV parse error on row ${fatal[0].row}: ${fatal[0].message}`);
  }

  // Resolve branch names to ids, creating branches on first sight
  const branches = await prisma.branch.findMany({ where: { companyId } });
  const branchByName = new Map(branches.map((b) => [b.name.toLowerCase(), b.id]));

  const results = { created: 0, updated: 0, failed: [] as { row: number; error: string }[] };

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    try {
      const name = (row.name ?? "").trim().replace(/\s+/g, " ");
      const [firstName, ...rest] = name.split(" ");
      const lastName = rest.join(" ");
      if (!firstName || !lastName) {
        throw new Error("Name must contain first and last name separated by a space");
      }

      let branchId: string | null = null;
      const branchName = (row.branch ?? "").trim();
      if (branchName) {
        branchId = branchByName.get(branchName.toLowerCase()) ?? null;
        if (!branchId) {
          const created = await prisma.branch.create({ data: { companyId, name: branchName } });
          branchByName.set(branchName.toLowerCase(), created.id);
          branchId = created.id;
        }
      }

      const data = importSchema.parse({
        staffNo: (row.staffNo ?? "").trim(),
        firstName,
        lastName,
        email: row.email?.trim() || null,
        nationalId: row.nationalId?.trim() || null,
        kraPin: row.kraPin?.trim() || null,
        nssfNo: row.nssfNo?.trim() || null,
        shifNo: row.shifNo?.trim() || null,
        designation: row.designation?.trim() || null,
        bankName: row.bankName?.trim() || null,
        bankCode: row.bankCode?.trim() || null,
        bankBranch: row.bankBranch?.trim() || null,
        bankBranchCode: row.bankBranchCode?.trim() || null,
        bankAccountNo: row.bankAccountNo?.trim() || null,
        employmentTypeId,
        branchId,
      });
      const existing = await prisma.employee.findUnique({
        where: { companyId_staffNo: { companyId, staffNo: data.staffNo } },
      });
      if (existing) {
        // basicPay is not in the CSV, so updates never touch existing pay
        await prisma.employee.update({ where: { id: existing.id }, data });
        results.updated++;
      } else {
        await prisma.employee.create({
          data: {
            companyId,
            ...data,
            basicPay: 0,
            salaryHistory: { create: { basicPay: 0, effectiveFrom: new Date(), note: "CSV import" } },
          },
        });
        results.created++;
      }
    } catch (e: any) {
      const issue = e?.issues?.[0];
      results.failed.push({
        row: i + 2,
        error: issue ? `${issue.path?.join(".") ?? ""}: ${issue.message}` : e.message ?? "Invalid row",
      });
    }
  }
  return results;
});
