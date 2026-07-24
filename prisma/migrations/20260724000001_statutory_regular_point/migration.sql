-- Statutory deductions (NSSF, SHIF, Housing Levy) are now computed on total
-- regular cash earnings rather than gross pay; PAYE stays on TAXABLE_PAY,
-- which is derived from total gross pay. Runs in its own migration because
-- Postgres cannot use an enum value in the transaction that added it.
UPDATE "Deduction" SET "point" = 'REGULAR_EARNINGS'
WHERE "statutory" = true AND "point" = 'GROSS_PAY';

-- Pre-tax schemes previously defaulted to GROSS_PAY; move them to the
-- regular-cash-earnings point to match the new statutory base.
UPDATE "Scheme" SET "point" = 'REGULAR_EARNINGS'
WHERE "point" = 'GROSS_PAY' AND "preTax" = true;

ALTER TABLE "Scheme" ALTER COLUMN "point" SET DEFAULT 'REGULAR_EARNINGS';

