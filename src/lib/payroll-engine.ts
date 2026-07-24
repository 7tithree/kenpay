/**
 * Payroll calculation engine.
 *
 * Earnings are split into:
 *  - Total REGULAR cash earnings: basic pay + regular allowances (guaranteed
 *    every period — house, transport...). Statutory deductions (NSSF, SHIF,
 *    Housing Levy) and schemes at the REGULAR_EARNINGS point are computed on
 *    this base.
 *  - Irregular (fluctuating) allowances: not guaranteed to occur (leave,
 *    overtime...). They count toward total gross pay and taxable pay (PAYE)
 *    but never inflate the statutory/regular deduction base.
 *
 * Net pay flow:
 * 1. Total gross pay = regular cash earnings + irregular allowances
 *    + non-cash benefits + bonus
 * 2. Less pre-tax deductions/schemes (NSSF, SHIF, Housing Levy, pension...) -> Taxable pay
 *    Benefits are non-cash (in-kind): they count toward gross pay but are
 *    exempt from taxable pay and are never paid out in net pay.
 *    Bonus is cash added DIRECTLY at the taxable-pay step: it is fully taxable
 *    but does not inflate the base that gross/regular-point deductions use.
 * 3. Apply PAYE bands (TIERED, point=TAXABLE_PAY) -> tax due, less personal relief
 *    PAYE still factors in the TOTAL gross pay via taxable pay.
 * 4. Deduct everything + post-tax (NET_PAY point) items -> Net pay (cash only)
 *
 * Deduction "point" controls the BASE the amount is computed on:
 *   BASIC_PAY | REGULAR_EARNINGS | GROSS_PAY | TAXABLE_PAY | NET_PAY
 * REGULAR_EARNINGS-point base = basic + regular allowances (cash only).
 * GROSS_PAY-point base = basic + all allowances + benefits (bonus excluded).
 * NET_PAY-point items are always post-tax and never reduce taxable pay.
 *
 * Money: the public API is in shillings, but ALL internal arithmetic is in
 * integer cents. Rounding policy: each payslip line is rounded to the cent
 * exactly once (half up), after relief/cap/min; gross, taxable and net are
 * exact integer sums of already-rounded cents, so per-employee figures and
 * report aggregates can never drift by float error.
 */

export type Tier = { upTo: number | null; rate: number }; // rate in %, upTo=null => open band

export type EngineDeduction = {
  id: string;
  name: string;
  method: "PERCENTAGE" | "FIXED" | "TIERED";
  point: "BASIC_PAY" | "REGULAR_EARNINGS" | "GROSS_PAY" | "TAXABLE_PAY" | "NET_PAY";
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
  regularEarnings: number; // total regular cash earnings: basic + regular allowances
  grossPay: number;        // total gross pay: regular + irregular + benefits + bonus
  taxablePay: number;
  netPay: number;
  lines: LineResult[];
};

// ---- Money helpers: shillings <-> integer cents ----
const toCents = (n: number) => Math.round(n * 100);
const fromCents = (c: number) => c / 100;
const roundCents = (c: number) => Math.round(c); // fractional cents -> whole, half up

/** Tiered amount in fractional cents; the caller rounds once per line. */
function tieredAmountCents(baseCents: number, tiers: Tier[]): number {
  let remaining = baseCents;
  let prevCeil = 0;
  let total = 0;
  for (const t of tiers) {
    const ceil = t.upTo === null ? null : toCents(t.upTo);
    const bandWidth = ceil === null ? remaining : Math.max(0, ceil - prevCeil);
    const inBand = Math.min(remaining, bandWidth);
    if (inBand <= 0) break;
    total += inBand * (t.rate / 100);
    remaining -= inBand;
    if (ceil === null) break;
    prevCeil = ceil;
  }
  return total;
}

/** Employee amount for one line, in whole cents. */
function computeAmountCents(d: EngineDeduction, baseCents: number): number {
  let amount = 0; // fractional cents until the single per-line rounding below
  const rate = d.ownRate ?? d.rate ?? 0;
  if (d.method === "FIXED") amount = toCents(rate);
  else if (d.method === "PERCENTAGE") amount = baseCents * (rate / 100);
  else if (d.method === "TIERED" && d.tiers?.length) amount = tieredAmountCents(baseCents, d.tiers);

  if (d.relief) amount = Math.max(0, amount - toCents(d.relief));
  if (d.capAmount != null) amount = Math.min(amount, toCents(d.capAmount));
  const rounded = roundCents(Math.max(0, amount));
  if (d.minAmount != null && rounded > 0) return Math.max(rounded, toCents(d.minAmount));
  return rounded;
}

/**
 * Employer match in whole cents. For TIERED deductions the employer pays
 * employerRate on the same bands as the employee (0%-rate bands stay 0), so
 * the match plateaus at the tier ceiling exactly like the employee amount —
 * e.g. NSSF employer stops at 6,480, not 6% of an unbounded gross. Non-tiered
 * matches are a flat percentage of the base, honouring the same cap as the
 * employee side.
 */
function employerMatchCents(d: EngineDeduction, baseCents: number): number {
  if (!d.employerRate) return 0;
  if (d.method === "TIERED" && d.tiers?.length) {
    const matchTiers = d.tiers.map((t) => ({
      upTo: t.upTo,
      rate: t.rate > 0 ? d.employerRate! : 0,
    }));
    return roundCents(tieredAmountCents(baseCents, matchTiers));
  }
  let amount = baseCents * (d.employerRate / 100);
  if (d.capAmount != null) amount = Math.min(amount, toCents(d.capAmount));
  return roundCents(Math.max(0, amount));
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
  const cents =
    e.method === "PERCENTAGE" ? roundCents(toCents(basicPay) * (rate / 100)) : toCents(rate);
  return fromCents(Math.max(0, cents));
}

export function calculatePayslip(opts: {
  basicPay: number;
  regularAllowances?: number;   // regular cash allowances total (guaranteed each period, taxable)
  irregularAllowances?: number; // fluctuating cash allowances total (leave, overtime..., taxable)
  benefits?: number;   // non-cash benefits total (in gross, exempt from taxable, not paid out)
  bonus?: number;      // cash bonus, added directly at the taxable-pay step
  deductions: EngineDeduction[]; // statutory + custom, exemptions already filtered out
  schemes: EngineDeduction[];    // employee's schemes
}): PayslipResult {
  const basicCents = toCents(opts.basicPay);
  const regularAllowanceCents = toCents(opts.regularAllowances ?? 0);
  const irregularAllowanceCents = toCents(opts.irregularAllowances ?? 0);
  const benefitCents = toCents(opts.benefits ?? 0);
  const bonusCents = toCents(opts.bonus ?? 0);

  // Base for REGULAR_EARNINGS-point deductions (statutory + schemes): only
  // earnings guaranteed every period, cash only.
  const regularCents = basicCents + regularAllowanceCents;
  // Base for GROSS_PAY-point deductions: bonus bypasses this and goes straight
  // into taxable pay.
  const grossBaseCents = regularCents + irregularAllowanceCents + benefitCents;
  // Reported total gross pay: every earning, cash and in-kind.
  const grossCents = grossBaseCents + bonusCents;
  const lines: LineResult[] = [];

  const all = [
    ...opts.deductions.map((d) => ({ ...d, kind: "DEDUCTION" as const })),
    ...opts.schemes.map((s) => ({ ...s, kind: "SCHEME" as const })),
  ];

  // Pass 1: pre-tax items computed on BASIC, REGULAR EARNINGS or GROSS
  let preTaxCents = 0;
  for (const d of all.filter((x) => x.preTax && x.point !== "TAXABLE_PAY" && x.point !== "NET_PAY")) {
    const base =
      d.point === "BASIC_PAY" ? basicCents
      : d.point === "REGULAR_EARNINGS" ? regularCents
      : grossBaseCents;
    const amount = computeAmountCents(d, base);
    const employerAmount = employerMatchCents(d, base);
    lines.push({
      id: d.id,
      name: d.name,
      amount: fromCents(amount),
      employerAmount: fromCents(employerAmount),
      kind: d.kind,
    });
    preTaxCents += amount;
  }

  // Benefits are exempt from taxable pay; bonus is added directly here.
  const taxableCents = Math.max(0, grossBaseCents - benefitCents - preTaxCents) + bonusCents;

  // Pass 2: items computed on TAXABLE_PAY (PAYE)
  let taxCents = 0;
  for (const d of all.filter((x) => x.point === "TAXABLE_PAY")) {
    const amount = computeAmountCents(d, taxableCents);
    lines.push({ id: d.id, name: d.name, amount: fromCents(amount), employerAmount: 0, kind: d.kind });
    taxCents += amount;
  }

  // Pass 3: post-tax items (point NET_PAY, or preTax=false on basic/gross)
  // Cash actually available after tax: gross minus non-cash benefits.
  let postTaxCents = 0;
  const afterTaxCents = grossCents - benefitCents - preTaxCents - taxCents;
  for (const d of all.filter(
    (x) => x.point === "NET_PAY" || (!x.preTax && x.point !== "TAXABLE_PAY")
  )) {
    const base =
      d.point === "NET_PAY" ? afterTaxCents
      : d.point === "BASIC_PAY" ? basicCents
      : d.point === "REGULAR_EARNINGS" ? regularCents
      : grossBaseCents;
    const amount = computeAmountCents(d, base);
    lines.push({ id: d.id, name: d.name, amount: fromCents(amount), employerAmount: 0, kind: d.kind });
    postTaxCents += amount;
  }

  // Net pay is cash only — benefits never reach the bank account.
  const netCents = grossCents - benefitCents - preTaxCents - taxCents - postTaxCents;
  return {
    regularEarnings: fromCents(regularCents),
    grossPay: fromCents(grossCents),
    taxablePay: fromCents(taxableCents),
    netPay: fromCents(netCents),
    lines,
  };
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
    point: "REGULAR_EARNINGS",
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
    point: "REGULAR_EARNINGS",
    rate: 2.75,
    capAmount: 5000,
    preTax: true,
  },
  {
    name: "Housing Levy",
    statutory: true,
    method: "PERCENTAGE",
    point: "REGULAR_EARNINGS",
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
