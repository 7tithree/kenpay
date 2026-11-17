-- SHIF has no upper cap: it is a flat 2.75% of regular cash earnings however
-- high. Drop the 5,000 cap the old defaults seeded.
UPDATE "Deduction" SET "capAmount" = NULL
WHERE "statutory" = true AND "name" = 'SHIF';

-- Registered pension contributions (NSSF + pension-kind schemes) are
-- tax-deductible only up to a combined KES 30,000/month; the surplus is
-- deducted from pay but stays in taxable pay. Flag which deductions count
-- toward that cap (schemes already carry kind = 'PENSION').
ALTER TABLE "Deduction" ADD COLUMN "pension" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Deduction" SET "pension" = true
WHERE "statutory" = true AND "name" = 'NSSF';
