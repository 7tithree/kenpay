import { z } from "zod";

export const allowanceSchema = z.object({
  name: z.string().min(1),
  method: z.enum(["PERCENTAGE", "FIXED"]).optional(), // % of basic pay, or fixed amount
  rate: z.number().nonnegative().nullable().optional(),
  active: z.boolean().optional(),
});
