/**
 * Payroll calculation engine.
 *
 * Net pay flow (per Statutory Deductions doc):
 * 1. Gross pay (basic + cash allowances + non-cash benefits + bonus)
 * 2. Less pre-tax deductions/schemes (NSSF, SHIF, Housing Levy, pension...) -> Taxable pay
 *    Benefits are non-cash (in-kind): they count toward gross pay but are
 *    exempt from taxable pay and are never paid out in net pay.
 *    Bonus is cash added DIRECTLY at the taxable-pay step: it is fully taxable
 *    but does not inflate the base that GROSS_PAY-point deductions use.
 * 3. Apply PAYE bands (TIERED, point=TAXABLE_PAY) -> tax due, less personal relief
 * 4. Deduct everything + post-tax (NET_PAY point) items -> Net pay (cash only)
 *
 * Deduction "point" controls the BASE the amount is computed on:
 *   BASIC_PAY | GROSS_PAY | TAXABLE_PAY | NET_PAY
 * GROSS_PAY-point base = basic + allowances + benefits (bonus excluded).
 * NET_PAY-point items are always post-tax and never reduce taxable pay.
 */

export type Tier = { upTo: number | null; rate: number }; // rate in %, upTo=null => open band

export type EngineDeduction = {
  id: string;
  name: string;
  method: "PERCENTAGE" | "FIXED" | "TIERED";
  point: "BASIC_PAY" | "GROSS_PAY" | "TAXABLE_PAY" | "NET_PAY";
  rate?: number | null;
  capAmount?: number | null;
  minAmount?: number | null;
  relief?: number | null;       // subtracted from computed amount (PAYE personal relief)
  employerRate?: number | null; // employer match %
  preTax: boolean;
  tiers?: Tier[] | null;
  ownRate?: number | null;      // per-employee override (schemes)
};

export type LineResult = {
  id: string;
  name: string;
  amount: number;         // employee amount
  employerAmount: number; // employer contribution
  kind: "DEDUCTION" | "SCHEME";
};

export type PayslipResult = {
  grossPay: number;
  taxablePay: number;
  netPay: number;
  lines: LineResult[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function tieredAmount(base: number, tiers: Tier[]): number {
  let remaining = base;
  let prevCeil = 0;
  let total = 0;
  for (const t of tiers) {
    const bandWidth = t.upTo === null ? remaining : Math.max(0, t.upTo - prevCeil);
    const inBand = Math.min(remaining, bandWidth);
    if (inBand <= 0) break;
    total += inBand * (t.rate / 100);
    remaining -= inBand;
    prevCeil = t.upTo ?? prevCeil;
    if (t.upTo === null) break;
  }
  return total;
}

function computeAmount(d: EngineDeduction, base: number): number {
  let amount = 0;
  const rate = d.ownRate ?? d.rate ?? 0;
  if (d.method === "FIXED") amount = rate;
  else if (d.method === "PERCENTAGE") amount = base * (rate / 100);
  else if (d.method === "TIERED" && d.tiers?.length) amount = tieredAmount(base, d.tiers);

  if (d.relief) amount = Math.max(0, amount - d.relief);
  if (d.capAmount != null) amount = Math.min(amount, d.capAmount);
  if (d.minAmount != null && amount > 0) amount = Math.max(amount, d.minAmount);
  return round2(Math.max(0, amount));
}

// Company-defined earnings (allowances/benefits): FIXED amount or PERCENTAGE
// of basic pay, with an optional per-employee override.
export type EngineEarning = {
  id: string;
  name: string;
  method: "PERCENTAGE" | "FIXED" | "TIERED";
  rate?: number | null;
  ownRate?: number | null;
};

export function computeEarning(e: EngineEarning, basicPay: number): number {
  const rate = e.ownRate ?? e.rate ?? 0;
  const amount = e.method === "PERCENTAGE" ? basicPay * (rate / 100) : rate;
  return round2(Math.max(0, amount));
}

export function calculatePayslip(opts: {
  basicPay: number;
  allowances?: number; // cash allowances total (taxable)
  benefits?: number;   // non-cash benefits total (in gross, exempt from taxable, not paid out)
  bonus?: number;      // cash bonus, added directly at the taxable-pay step
  deductions: EngineDeduction[]; // statutory + custom, exemptions already filtered out
  schemes: EngineDeduction[];    // employee's schemes
}): PayslipResult {
  const allowances = opts.allowances ?? 0;
  const benefits = opts.benefits ?? 0;
  const bonus = opts.bonus ?? 0;

  // Base for GROSS_PAY-point deductions: bonus bypasses this and goes straight
  // into taxable pay.
  const grossBase = round2(opts.basicPay + allowances + benefits);
  // Reported gross pay: every earning, cash and in-kind.
  const grossPay = round2(grossBase + bonus);
  const lines: LineResult[] = [];

  const all = [
    ...opts.deductions.map((d) => ({ ...d, kind: "DEDUCTION" as const })),
    ...opts.schemes.map((s) => ({ ...s, kind: "SCHEME" as const })),
  ];

  // Pass 1: pre-tax items computed on BASIC or GROSS
  let preTaxTotal = 0;
  for (const d of all.filter((x) => x.preTax && x.point !== "TAXABLE_PAY" && x.point !== "NET_PAY")) {
    const base = d.point === "BASIC_PAY" ? opts.basicPay : grossBase;
    const amount = computeAmount(d, base);
    const employerAmount = d.employerRate ? round2(base * (d.employerRate / 100)) : 0;
    lines.push({ id: d.id, name: d.name, amount, employerAmount, kind: d.kind });
    preTaxTotal += amount;
  }

  // Benefits are exempt from taxable pay; bonus is added directly here.
  const taxablePay = round2(Math.max(0, grossBase - benefits - preTaxTotal) + bonus);

  // Pass 2: items computed on TAXABLE_PAY (PAYE)
  let taxTotal = 0;
  for (const d of all.filter((x) => x.point === "TAXABLE_PAY")) {
    const amount = computeAmount(d, taxablePay);
    lines.push({ id: d.id, name: d.name, amount, employerAmount: 0, kind: d.kind });
    taxTotal += amount;
  }

  // Pass 3: post-tax items (point NET_PAY, or preTax=false on basic/gross)
  // Cash actually available after tax: gross minus non-cash benefits.
  let postTaxTotal = 0;
  const afterTax = round2(grossPay - benefits - preTaxTotal - taxTotal);
  for (const d of all.filter(
    (x) => x.point === "NET_PAY" || (!x.preTax && x.point !== "TAXABLE_PAY")
  )) {
    const base =
      d.point === "NET_PAY" ? afterTax : d.point === "BASIC_PAY" ? opts.basicPay : grossBase;
    const amount = computeAmount(d, base);
    lines.push({ id: d.id, name: d.name, amount, employerAmount: 0, kind: d.kind });
    postTaxTotal += amount;
  }

  // Net pay is cash only — benefits never reach the bank account.
  const netPay = round2(grossPay - benefits - preTaxTotal - taxTotal - postTaxTotal);
  return { grossPay, taxablePay, netPay, lines };
}

// ---- Kenyan statutory defaults (seeded per company; editable from the frontend) ----
export const KENYA_DEFAULT_DEDUCTIONS = [
  {
    name: "PAYE",
    statutory: true,
    method: "TIERED",
    point: "TAXABLE_PAY",
    relief: 2400,
    preTax: false,
    tiers: [
      { upTo: 24000, rate: 10 },
      { upTo: 32333, rate: 25 },
      { upTo: 500000, rate: 30 },
      { upTo: 800000, rate: 32.5 },
      { upTo: null, rate: 35 },
    ],
  },
  {
    name: "NSSF",
    statutory: true,
    method: "TIERED",
    point: "GROSS_PAY",
    preTax: true,
    employerRate: 6,
    tiers: [
      { upTo: 9000, rate: 6 },   // Tier I (max 540)
      { upTo: 108000, rate: 6 }, // Tier II (max 5,940)
      { upTo: null, rate: 0 },
    ],
  },
  {
    name: "SHIF",
    statutory: true,
    method: "PERCENTAGE",
    point: "GROSS_PAY",
    rate: 2.75,
    capAmount: 5000,
    preTax: true,
  },
  {
    name: "Housing Levy",
    statutory: true,
    method: "PERCENTAGE",
    point: "GROSS_PAY",
    rate: 1.5,
    employerRate: 1.5,
    preTax: true,
  },
] as const;

export const KENYA_DEFAULT_WHT = [
  { category: "Professional fees", resident: true, rate: 5 },
  { category: "Rent (residential)", resident: true, rate: 10 },
  { category: "Dividends", resident: true, rate: 5 },
  { category: "Interest", resident: true, rate: 15 },
];
