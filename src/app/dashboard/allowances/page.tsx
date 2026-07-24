"use client";
import EarningSection from "@/components/EarningSection";

export default function AllowancesPage() {
  return (
    <EarningSection
      title="Allowances"
      singular="allowance"
      hint="Cash allowances broken down per type so cash flow stays traceable. Regular allowances (house, transport, airtime…) are guaranteed every period and form part of the total regular cash earnings that statutory deductions are computed on. Fluctuating allowances (leave, overtime…) are not guaranteed: they only count toward total gross pay, so PAYE still taxes them but other statutory deductions ignore them. Assign each allowance to the employees who receive it, optionally with their own amount."
      apiBase="/api/allowances"
      permPrefix="allowance"
      withRegularFlag
    />
  );
}
