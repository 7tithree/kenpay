import { z } from "zod";

export const allowanceSchema = z.object({
  name: z.string().min(1),
  method: z.enum(["PERCENTAGE", "FIXED"]).optional(), // % of basic pay, or fixed amount
  rate: z.number().nonnegative().nullable().optional(),
  // Regular = guaranteed every period (part of total regular cash earnings);
  // false = fluctuating/irregular (leave, overtime...), gross pay + PAYE only.
  regular: z.boolean().optional(),
  active: z.boolean().optional(),
});
