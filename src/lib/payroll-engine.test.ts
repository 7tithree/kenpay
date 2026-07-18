import { describe, it, expect } from "vitest";
import {
  calculatePayslip,
  computeEarning,
  KENYA_DEFAULT_DEDUCTIONS,
  type EngineDeduction,
  type PayslipResult,
} from "./payroll-engine";

/** Kenyan statutory defaults as the engine receives them at run time. */
function statutory(): EngineDeduction[] {
  return KENYA_DEFAULT_DEDUCTIONS.map((d: any, i: number) => ({
    id: `stat-${i}`,
    name: d.name,
    method: d.method,
    point: d.point,
    rate: d.rate ?? null,
    capAmount: d.capAmount ?? null,
    minAmount: null,
    relief: d.relief ?? null,
    employerRate: d.employerRate ?? null,
    preTax: d.preTax,
    tiers: d.tiers ? d.tiers.map((t: any) => ({ ...t })) : null,
  }));
}

const payeOnly = () => statutory().filter((d) => d.name === "PAYE");

const line = (r: PayslipResult, name: string) => {
  const found = r.lines.find((l) => l.name === name);
  if (!found) throw new Error(`no payslip line named ${name}`);
  return found;
};

const slip = (
  basicPay: number,
  extra: Partial<Parameters<typeof calculatePayslip>[0]> = {}
) => calculatePayslip({ basicPay, deductions: statutory(), schemes: [], ...extra });

describe("statutory defaults — full payslip", () => {
  it("matches the hand-verified KSh 50,000 basic pay case", () => {
    const r = slip(50_000);
    expect(r.grossPay).toBe(50_000);
    expect(line(r, "NSSF").amount).toBe(3_000); // 9,000@6% + 41,000@6%
    expect(line(r, "SHIF").amount).toBe(1_375); // 2.75%
    expect(line(r, "Housing Levy").amount).toBe(750); // 1.5%
    expect(r.taxablePay).toBe(44_875);
    expect(line(r, "PAYE").amount).toBe(5_845.85); // bands less 2,400 relief
    expect(r.netPay).toBe(39_029.15);
  });

  it("matches KSh 100,000 basic pay", () => {
    const r = slip(100_000);
    expect(line(r, "NSSF").amount).toBe(6_000);
    expect(line(r, "SHIF").amount).toBe(2_750);
    expect(line(r, "Housing Levy").amount).toBe(1_500);
    expect(r.taxablePay).toBe(89_750);
    expect(line(r, "PAYE").amount).toBe(19_308.35);
    expect(r.netPay).toBe(70_441.65);
  });

  it("reports employer contributions separately (50,000 case)", () => {
    const r = slip(50_000);
    expect(line(r, "NSSF").employerAmount).toBe(3_000);
    expect(line(r, "Housing Levy").employerAmount).toBe(750);
    expect(line(r, "SHIF").employerAmount).toBe(0);
    expect(line(r, "PAYE").employerAmount).toBe(0);
  });
});

describe("PAYE bands and relief", () => {
  it("is fully offset by relief at the first band ceiling (24,000)", () => {
    const r = calculatePayslip({ basicPay: 24_000, deductions: payeOnly(), schemes: [] });
    expect(r.taxablePay).toBe(24_000); // 24,000 @ 10% = 2,400, minus 2,400 relief
    expect(line(r, "PAYE").amount).toBe(0);
  });

  it("never goes negative when relief exceeds computed tax", () => {
    const r = calculatePayslip({ basicPay: 10_000, deductions: payeOnly(), schemes: [] });
    expect(line(r, "PAYE").amount).toBe(0);
    expect(r.netPay).toBe(10_000);
  });

  it("is exact at the second band ceiling (32,333)", () => {
    const r = calculatePayslip({ basicPay: 32_333, deductions: payeOnly(), schemes: [] });
    // 24,000@10% + 8,333@25% = 4,483.25, less 2,400 relief
    expect(line(r, "PAYE").amount).toBe(2_083.25);
  });

  it("applies all five bands for a 1,000,000 taxable pay", () => {
    const r = calculatePayslip({ basicPay: 1_000_000, deductions: payeOnly(), schemes: [] });
    // 2,400 + 2,083.25 + 140,300.10 + 97,500 + 70,000 = 312,283.35, less 2,400
    expect(line(r, "PAYE").amount).toBe(309_883.35);
  });
});

describe("NSSF tiers and SHIF cap", () => {
  it("hits the NSSF tier boundaries exactly", () => {
    expect(line(slip(9_000), "NSSF").amount).toBe(540); // Tier I ceiling
    expect(line(slip(108_000), "NSSF").amount).toBe(6_480); // Tier II ceiling
  });

  it("plateaus employee NSSF above 108,000 gross", () => {
    expect(line(slip(150_000), "NSSF").amount).toBe(6_480);
  });

  // KNOWN BUG: the employer match is a flat percentage of the full base, so it
  // is not capped by the tiers. Statutorily the employer matches the employee's
  // tiered amount (6,480 here), but the engine computes 6% of 150,000 = 9,000.
  it.fails("caps the NSSF employer match at the tier ceiling (documents known bug)", () => {
    expect(line(slip(150_000), "NSSF").employerAmount).toBe(6_480);
  });

  it("caps SHIF at 5,000", () => {
    expect(line(slip(200_000), "SHIF").amount).toBe(5_000); // 2.75% would be 5,500
  });
});

describe("bonus and benefits", () => {
  it("taxes a bonus fully without inflating gross-point deduction bases", () => {
    const r = slip(50_000, { bonus: 10_000 });
    expect(r.grossPay).toBe(60_000);
    // Statutory gross-point items still computed on 50,000
    expect(line(r, "NSSF").amount).toBe(3_000);
    expect(line(r, "SHIF").amount).toBe(1_375);
    expect(r.taxablePay).toBe(54_875); // 44,875 + 10,000
    expect(line(r, "PAYE").amount).toBe(8_845.85); // bonus taxed at 30% marginal
    expect(r.netPay).toBe(46_029.15); // 39,029.15 + 10,000 - 3,000 extra PAYE
  });

  it("includes non-cash benefits in gross but not in taxable or net pay", () => {
    const r = slip(50_000, { benefits: 10_000 });
    expect(r.grossPay).toBe(60_000);
    // Gross-point deductions DO see the benefit (base 60,000)
    expect(line(r, "NSSF").amount).toBe(3_600);
    expect(line(r, "SHIF").amount).toBe(1_650);
    expect(line(r, "Housing Levy").amount).toBe(900);
    expect(r.taxablePay).toBe(43_850); // 60,000 - 10,000 benefit - 6,150 pre-tax
    expect(line(r, "PAYE").amount).toBe(5_538.35);
    expect(r.netPay).toBe(38_311.65); // benefit never paid out in cash
  });
});

describe("deduction mechanics", () => {
  const base: EngineDeduction = {
    id: "x",
    name: "X",
    method: "FIXED",
    point: "BASIC_PAY",
    preTax: false,
  };

  const single = (d: Partial<EngineDeduction>, basicPay = 50_000) =>
    calculatePayslip({ basicPay, deductions: [{ ...base, ...d }], schemes: [] });

  it("applies relief before the cap", () => {
    const r = single({ method: "FIXED", rate: 3_000, relief: 2_400, capAmount: 500 });
    expect(line(r, "X").amount).toBe(500); // 3,000 - 2,400 = 600, capped at 500
  });

  it("enforces minAmount only when the computed amount is positive", () => {
    const min800 = single({ method: "PERCENTAGE", rate: 1, minAmount: 800 });
    expect(line(min800, "X").amount).toBe(800); // 1% of 50,000 = 500, floored to 800
    const zero = single({ method: "PERCENTAGE", rate: 0, minAmount: 800 });
    expect(line(zero, "X").amount).toBe(0); // zero stays zero
  });

  it("computes NET_PAY-point items on cash after tax", () => {
    const loan: EngineDeduction = {
      ...base,
      id: "loan",
      name: "Sacco loan",
      method: "FIXED",
      point: "NET_PAY",
      rate: 1_000,
    };
    const r = calculatePayslip({
      basicPay: 50_000,
      deductions: [...statutory(), loan],
      schemes: [],
    });
    expect(line(r, "Sacco loan").amount).toBe(1_000);
    expect(r.netPay).toBe(38_029.15); // 39,029.15 - 1,000
    expect(r.taxablePay).toBe(44_875); // post-tax item never reduces taxable
  });

  it("lets a per-employee ownRate override the scheme rate, pre-tax", () => {
    const pension: EngineDeduction = {
      id: "pen",
      name: "Pension",
      method: "PERCENTAGE",
      point: "BASIC_PAY",
      rate: 5,
      ownRate: 10,
      preTax: true,
    };
    const r = calculatePayslip({ basicPay: 50_000, deductions: [], schemes: [pension] });
    expect(line(r, "Pension").amount).toBe(5_000); // 10%, not 5%
    expect(line(r, "Pension").kind).toBe("SCHEME");
    expect(r.taxablePay).toBe(45_000);
    expect(r.netPay).toBe(45_000);
  });

  it("handles zero basic pay with no deductions applied", () => {
    const r = slip(0);
    expect(r.grossPay).toBe(0);
    expect(r.taxablePay).toBe(0);
    expect(r.netPay).toBe(0);
    for (const l of r.lines) expect(l.amount).toBe(0);
  });

  it("returns gross as net when there are no deductions at all", () => {
    const r = calculatePayslip({ basicPay: 75_000, deductions: [], schemes: [] });
    expect(r.netPay).toBe(75_000);
    expect(r.lines).toHaveLength(0);
  });
});

describe("computeEarning", () => {
  it("supports fixed amounts, percentages of basic, and ownRate overrides", () => {
    expect(computeEarning({ id: "a", name: "A", method: "FIXED", rate: 4_000 }, 50_000)).toBe(4_000);
    expect(computeEarning({ id: "a", name: "A", method: "PERCENTAGE", rate: 15 }, 50_000)).toBe(7_500);
    expect(
      computeEarning({ id: "a", name: "A", method: "PERCENTAGE", rate: 15, ownRate: 20 }, 50_000)
    ).toBe(10_000);
  });

  it("never returns a negative earning", () => {
    expect(computeEarning({ id: "a", name: "A", method: "FIXED", rate: -100 }, 50_000)).toBe(0);
  });
});
