import { z } from "zod";

export const deductionSchema = z.object({
  name: z.string().min(1),
  statutory: z.boolean().optional(),
  method: z.enum(["PERCENTAGE", "FIXED", "TIERED"]),
  point: z.enum(["BASIC_PAY", "REGULAR_EARNINGS", "GROSS_PAY", "TAXABLE_PAY", "NET_PAY"]),
  rate: z.number().nonnegative().nullable().optional(),
  capAmount: z.number().nonnegative().nullable().optional(),
  minAmount: z.number().nonnegative().nullable().optional(),
  relief: z.number().nonnegative().nullable().optional(),
  employerRate: z.number().nonnegative().nullable().optional(),
  preTax: z.boolean().optional(),
  pension: z.boolean().optional(),
  tiers: z.array(z.object({ upTo: z.number().nullable(), rate: z.number() })).nullable().optional(),
  active: z.boolean().optional(),
});
