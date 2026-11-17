import { z } from "zod";

export const benefitSchema = z.object({
  name: z.string().min(1),
  method: z.enum(["PERCENTAGE", "FIXED"]).optional(), // % of basic pay, or fixed value
  rate: z.number().nonnegative().nullable().optional(),
  taxable: z.boolean().optional(),
  capAmount: z.number().nonnegative().nullable().optional(), // non-taxable: exemption cap
  active: z.boolean().optional(),
});
