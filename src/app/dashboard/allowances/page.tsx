"use client";
import EarningSection from "@/components/EarningSection";

export default function AllowancesPage() {
  return (
    <EarningSection
      title="Allowances"
      singular="allowance"
      hint="Cash allowances (house, transport, airtime…) broken down per type so cash flow stays traceable. Allowances are taxable: they count toward gross pay and taxable pay. Assign each allowance to the employees who receive it, optionally with their own amount."
      apiBase="/api/allowances"
      permPrefix="allowance"
    />
  );
}
