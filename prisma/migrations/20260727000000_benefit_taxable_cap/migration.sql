-- Benefits can now be taxable (full value counts toward taxable pay) or
-- non-taxable (exempt up to an optional cap; any surplus above the cap is
-- added to taxable pay). Existing benefits are taxable, so the default
-- backfills them correctly.
ALTER TABLE "Benefit" ADD COLUMN "taxable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Benefit" ADD COLUMN "capAmount" DECIMAL(14,2);
