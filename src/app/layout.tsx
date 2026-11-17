import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ken Pay — Payroll",
  description: "Multi-company payroll with configurable statutory deductions",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
