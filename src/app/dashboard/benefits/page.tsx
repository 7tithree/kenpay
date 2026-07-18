"use client";
import EarningSection from "@/components/EarningSection";

export default function BenefitsPage() {
  return (
    <EarningSection
      title="Benefits"
      singular="benefit"
      hint="Non-cash (in-kind) benefits — company car, housing, meals… Their value counts toward total gross pay but is exempt from taxable pay, and it is never paid out in net pay. Assign each benefit to the employees who receive it, optionally with their own value."
      apiBase="/api/benefits"
      permPrefix="benefit"
    />
  );
}
