-- New deduction point: total regular cash earnings (basic + regular allowances).
ALTER TYPE "DeductionPoint" ADD VALUE 'REGULAR_EARNINGS';

-- Allowances are either regular (guaranteed every period) or fluctuating
-- (leave, overtime...); only regular ones feed the statutory deduction base.
ALTER TABLE "Allowance" ADD COLUMN "regular" BOOLEAN NOT NULL DEFAULT true;

-- Store the regular-cash-earnings subtotal per payslip (null on legacy slips).
ALTER TABLE "Payslip" ADD COLUMN "regularEarnings" DECIMAL(14,2);
