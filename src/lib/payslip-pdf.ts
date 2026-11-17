import PDFDocument from "pdfkit";

export type PayslipData = {
  company: { name: string; kraPin?: string | null; address?: string | null };
  period: string;
  status: string;
  employee: {
    staffNo: string;
    firstName: string;
    lastName: string;
    kraPin?: string | null;
    nssfNo?: string | null;
    shifNo?: string | null;
  };
  regularEarnings?: number | null; // total regular cash earnings (null on legacy slips)
  grossPay: number;
  taxablePay: number;
  netPay: number;
  lines: { label: string; kind: string; amount: number; employerAmount?: number | null }[];
};

const money = (n: number) =>
  n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const FONT = "Helvetica";
const BOLD = "Helvetica-Bold";
const MONO = "Courier";

/** Render a single payslip as a one-page A4 PDF. Returns the PDF bytes. */
export async function buildPayslipPdf(p: PayslipData): Promise<Uint8Array> {
  const doc = new PDFDocument({ size: "A4", margin: 0 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Uint8Array>((resolve, reject) => {
    doc.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    doc.on("error", reject);
  });

  const green = "#186140";
  const ink = "#212624";
  const faint = "#738078";
  const M = 48; // margin
  const H = doc.page.height; // A4 portrait, points
  const W = doc.page.width - M * 2;
  let y = H - M; // baseline position, measured from the bottom edge like PDF coordinates

  const width = (s: string, size: number, f: string) =>
    doc.font(f).fontSize(size).widthOfString(s);
  // y holds a baseline; pdfkit anchors text at the top of the line, so shift up by ~ascent.
  const text = (s: string, x: number, size = 10, f = FONT, color = ink) =>
    doc.font(f).fontSize(size).fillColor(color).text(s, x, H - y - size * 0.75, { lineBreak: false });
  const right = (s: string, size = 10, f = MONO, color = ink) =>
    text(s, M + W - width(s, size, f), size, f, color);
  const rule = (color = "#d9e0db") =>
    doc.moveTo(M, H - y).lineTo(M + W, H - y).lineWidth(0.8).strokeColor(color).stroke();

  // Header
  text(p.company.name.toUpperCase(), M, 16, BOLD, green);
  y -= 14;
  const sub = [p.company.address, p.company.kraPin ? `PIN ${p.company.kraPin}` : null]
    .filter(Boolean)
    .join("  ·  ");
  if (sub) { text(sub, M, 9, FONT, faint); }
  y += 14;
  right(`PAYSLIP — ${p.period}`, 12, BOLD, green);
  y -= 8;
  right(p.status, 9, FONT, faint);
  y -= 16;
  rule(green);
  y -= 18;

  // Employee block
  text("Employee", M, 9, BOLD, faint);
  text("Staff No", M + W / 2, 9, BOLD, faint);
  y -= 13;
  text(`${p.employee.firstName} ${p.employee.lastName}`, M, 11, BOLD);
  text(p.employee.staffNo, M + W / 2, 11, MONO);
  y -= 14;
  const ids = [
    p.employee.kraPin ? `KRA ${p.employee.kraPin}` : null,
    p.employee.nssfNo ? `NSSF ${p.employee.nssfNo}` : null,
    p.employee.shifNo ? `SHIF ${p.employee.shifNo}` : null,
  ].filter(Boolean).join("   ");
  if (ids) { text(ids, M, 9, FONT, faint); y -= 8; }
  y -= 12;
  rule();
  y -= 18;

  // Lines: earnings, non-cash benefits, then deductions/schemes, then employer contributions
  const sections: [string, PayslipData["lines"]][] = [
    ["EARNINGS", p.lines.filter((l) => l.kind === "EARNING")],
    ["BENEFITS (non-cash)", p.lines.filter((l) => l.kind === "BENEFIT")],
    ["DEDUCTIONS", p.lines.filter((l) => l.kind === "DEDUCTION" || l.kind === "SCHEME")],
  ];
  for (const [title, lines] of sections) {
    if (!lines.length) continue;
    text(title, M, 9, BOLD, green);
    y -= 14;
    for (const l of lines) {
      text(l.label, M + 8, 10);
      right(money(l.amount));
      y -= 14;
    }
    y -= 4;
    rule();
    y -= 16;
  }

  // Totals
  const totals: [string, number, boolean][] = [
    ...(p.regularEarnings != null
      ? [["Regular cash earnings", p.regularEarnings, false] as [string, number, boolean]]
      : []),
    ["Total gross pay", p.grossPay, false],
    ["Taxable pay", p.taxablePay, false],
    ["NET PAY", p.netPay, true],
  ];
  for (const [label, amount, big] of totals) {
    text(label, M + 8, big ? 12 : 10, big ? BOLD : FONT, big ? green : ink);
    right(`KSh ${money(amount)}`, big ? 12 : 10, MONO, big ? green : ink);
    y -= big ? 20 : 15;
  }
  rule(green);
  y -= 18;

  // Employer contributions (informational)
  const employer = p.lines.filter((l) => (l.employerAmount ?? 0) > 0);
  if (employer.length) {
    text("EMPLOYER CONTRIBUTIONS (not deducted from pay)", M, 9, BOLD, faint);
    y -= 14;
    for (const l of employer) {
      text(l.label, M + 8, 9, FONT, faint);
      right(money(Number(l.employerAmount)), 9, MONO, faint);
      y -= 13;
    }
  }

  // Footer
  y = 40;
  text(`Generated ${new Date().toISOString().slice(0, 10)} · Ken Pay`, M, 8, FONT, faint);

  doc.end();
  return done;
}
