import nodemailer from "nodemailer";
import { ApiError } from "./auth";

/**
 * SMTP transport configured from env. Works with any SMTP provider,
 * including AWS SES SMTP credentials for the eventual AWS deployment:
 *   SMTP_HOST=email-smtp.<region>.amazonaws.com
 *   SMTP_PORT=587
 *   SMTP_USER=... SMTP_PASS=...
 *   MAIL_FROM="Acme Payroll <payroll@acme.co.ke>"
 */
function transport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST) {
    throw new ApiError(
      501,
      "Email is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM in .env"
    );
  }
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT ?? 587),
    secure: Number(SMTP_PORT) === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
}

export async function sendPayslipEmail(opts: {
  to: string;
  companyName: string;
  period: string;
  employeeName: string;
  pdf: Uint8Array;
}) {
  const t = transport();
  await t.sendMail({
    from: process.env.MAIL_FROM ?? "payroll@localhost",
    to: opts.to,
    subject: `${opts.companyName} — Payslip for ${opts.period}`,
    text: `Dear ${opts.employeeName},\n\nPlease find attached your payslip for ${opts.period}.\n\nThis is an automated message from ${opts.companyName} payroll.`,
    attachments: [
      {
        filename: `payslip-${opts.period}.pdf`,
        content: Buffer.from(opts.pdf),
        contentType: "application/pdf",
      },
    ],
  });
}
