import { z } from "zod";

export const schemeSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(["PENSION", "MORTGAGE_INTEREST", "POST_RETIREMENT_MEDICAL", "OTHER"]),
  method: z.enum(["PERCENTAGE", "FIXED", "TIERED"]),
  point: z.enum(["BASIC_PAY", "REGULAR_EARNINGS", "GROSS_PAY", "TAXABLE_PAY", "NET_PAY"]).optional(),
  rate: z.number().nonnegative().nullable().optional(),
  capAmount: z.number().nonnegative().nullable().optional(),
  employerRate: z.number().nonnegative().nullable().optional(),
  preTax: z.boolean().optional(),
  active: z.boolean().optional(),
});
