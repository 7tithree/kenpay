import { z } from "zod";

export const employeeSchema = z.object({
  staffNo: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().nullable().optional(),
  nationalId: z.string().nullable().optional(),
  kraPin: z.string().nullable().optional(),
  nssfNo: z.string().nullable().optional(),
  shifNo: z.string().nullable().optional(),
  designation: z.string().nullable().optional(),
  bankName: z.string().nullable().optional(),
  bankCode: z.string().nullable().optional(),
  bankBranch: z.string().nullable().optional(),
  bankBranchCode: z.string().nullable().optional(),
  bankAccountNo: z.string().nullable().optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "TERMINATED", "ON_LEAVE"]).optional(),
  basicPay: z.number().nonnegative(),
  employmentTypeId: z.string().nullable().optional(),
  branchId: z.string().nullable().optional(),
});
