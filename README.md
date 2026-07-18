# KenPay — Multi-company Kenyan payroll

Next.js 14 (App Router) + PostgreSQL (Prisma). Phase 1 build.

## What's included

- **Auth**: register / login / logout with httpOnly JWT cookies; middleware guards the dashboard.
- **Multi-company**: a user can belong to many companies and switch between them from the top bar. The active company lives in the session; every API call is scoped to it.
- **RBAC**: permission keys derived directly from Permissions.txt (payroll run/certify/approve/cancel, rate editing, payslip email/download, reports view/export, employment types CRUD, salaries, employees CRUD + status + export/import, general permissions, company settings + role assignment). Role presets (Admin, Payroll Officer, Approver, Viewer) are seeded per company; custom roles can be created and assigned to users by email.
- **Deductions**: per-company, fully editable from the frontend (rates change with the law). Each deduction has:
  - a calculation method: percentage, fixed, or tiered bands
  - a deduction point: **basic pay, gross pay, taxable pay, or net pay**
  - optional cap, minimum, relief (PAYE personal relief), employer match, pre/post-tax flag
  - per-employee **exemptions**
  - New companies are auto-seeded with PAYE (tiered + KSh 2,400 relief), NSSF (tiered, employer match), SHIF (2.75%, KSh 5,000 cap), Housing Levy (1.5% + 1.5% employer).
- **Schemes** (separate section, same concept): pension / mortgage interest / post-retirement medical / other, with caps for allowable deductions and per-employee enrolment (optionally with an employee-specific rate).
- **Payroll engine** (`src/lib/payroll-engine.ts`): Gross → less pre-tax items → Taxable → PAYE bands less relief → less post-tax (net-pay point) items → Net. Verified against hand-calculated figures for KSh 50,000 gross.
- **Payroll runs**: Draft → Certified → Approved, with Cancel; each transition gated by its own permission. Payslips with line items (incl. employer contributions) are stored per run.
- **CSV upload**: employees (create-or-update by staff number, per-row validation with row-level error reporting) and payroll details per period (allowances by staff number). Sample files in `samples/`.
- **CSV export** of employee details.
- **WHT rates**: definable per company (defaults seeded: professional fees 5%, residential rent 10%, dividends 5%, interest 15%) — reports are under the Reports tab.
- **Error handling**: one `handler()` wrapper gives every API route consistent JSON errors (401/403/404/409/413/422/500), Zod validation with field-level messages, Prisma unique-constraint mapping; the UI surfaces all of it in banners.

## Setup

```bash
npm install
cp .env.example .env        # set DATABASE_URL + a strong AUTH_SECRET
npm run db:deploy           # create tables (applies prisma/migrations)
npm run db:seed             # optional demo user
npm run dev
```

Register, then go to **Company settings → Create a new company**. It arrives pre-loaded with statutory deductions, roles, WHT rates, and employment types.

## Phase 2 (included)

- **Payslip PDF** — one-click download per payslip (`payslip.download` permission), rendered server-side with pdfkit: company header, employee identifiers, earnings/deductions, totals, and employer contributions shown separately.
- **Payslip email** — sends the same PDF to the employee's address (`payslip.email`). Configure SMTP in `.env` (works with any provider; use AWS SES SMTP credentials when deploying to AWS). Unconfigured email returns a clear 501 with instructions instead of failing silently.
- **Deduction reports** (`reports.view`) — pick a period: summary of every deduction (employee count, employee total, employer total), then drill into any one for per-employee detail with KRA PINs. Both views export to CSV with `reports.export`.
- **WHT report** — record payments subject to withholding (payee, category, gross); the WHT amount is computed from the company's editable rate table. The report aggregates by category over any month range and exports to CSV.
- **Reset payroll settings** (`general.reset_payroll`, in Settings → Danger zone) — restores statutory deductions and WHT rates to Kenyan defaults, deactivates custom deductions (never deletes, so historic payslips stay intact), and clears pending payroll inputs. Runs and payslips are untouched.
- **Audit trail** — payroll runs and status changes, rate edits, resets, payslip emails, branch and WHT changes are logged with user, timestamp and detail; view under the Audit trail tab.
- **Branches** — manage branches in Settings (inline rename, employee counts, safe delete that unassigns employees) and assign employees to a branch on creation.

> Upgrading from the Phase 1 zip? Run `npm install` and `npm run db:deploy` again — Phase 2 adds a `WhtPayment` table.

### Schema changes

The schema is managed with Prisma migrations (`prisma/migrations`, baselined 2026-07-18). After editing `schema.prisma`, run `npm run db:migrate` to generate and apply a named migration locally; `npm run db:deploy` applies committed migrations without generating new ones (use this in production). Don't use `prisma db push` — it bypasses migration history.

### Email configuration

```
SMTP_HOST=email-smtp.eu-west-1.amazonaws.com   # or any SMTP host
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
MAIL_FROM="Acme Payroll <payroll@acme.co.ke>"
```

## Phase 3 (included)

- **Statutory returns** (Reports → Statutory returns): KRA P10 (PAYE), NSSF, SHIF and Housing Levy extracts per period, with employee identifiers (KRA PIN / NSSF No / SHIF No / national ID), per-employee amounts, employer contributions and totals. Generated **only from approved runs** so filings always match what was paid. CSV export gated by `reports.export`.
- **Deployment**: production `Dockerfile` (multi-stage, non-root, Next.js standalone output), `docker-compose.yml` for a full local rehearsal (`docker compose up --build`), and `DEPLOYMENT.md` — a step-by-step AWS guide (RDS PostgreSQL, ECR, App Runner with VPC connector, SES SMTP for payslip email, secrets, hardening checklist, ECS alternative).

## Requirements coverage (Permissions.txt)

Every line has both API enforcement and a UI surface:
1. Payroll/taxes/deductions — view, run, certify, approve, cancel, rate editing, per-employee exemptions (manage from the Deductions page)
2. Payslips — PDF download and email per payslip
3. Reports — per-deduction reports (summary + drill-down), WHT report, statutory returns; view/export permissions enforced separately
4. Employment types — view, create, rename, delete (Settings)
5. Salaries — per-employee history panel (Employees page): view, add rate, edit, delete
6. Employees — view, add, edit, delete, status changes, CSV export + import
7. General — "access salary rates" hides pay amounts (list + export) without it; "access pension rates" gates Schemes; reset payroll settings in Danger zone
8. Company settings — company details, branches, roles (full create/edit/delete with permission checkboxes + assignment by email), delete company

## Phase 4 ideas
- Employee self-service portal (own payslips only)
- Prisma migrations pipeline + CI (GitHub Actions → ECR → App Runner)
- Multi-currency and mid-month proration
