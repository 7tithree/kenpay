import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCompany, ApiError } from "@/lib/auth";
import { handler, json } from "@/lib/api";
import { logAudit } from "@/lib/audit";

// Auth routes read cookies, so they can never be statically rendered.
export const dynamic = "force-dynamic";

// GET /api/wht-payments?from=2026-01&to=2026-12 — list recorded WHT payments
export const GET = handler(async (req) => {
  const { companyId } = await requireCompany("reports.view");
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  return prisma.whtPayment.findMany({
    where: {
      companyId,
      ...(from ? { paidOn: { gte: new Date(`${from}-01`) } } : {}),
      ...(to ? { paidOn: { ...(from ? { gte: new Date(`${from}-01`) } : {}), lt: nextMonth(to) } } : {}),
    },
    orderBy: { paidOn: "desc" },
  });
});

function nextMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1));
}

const createSchema = z.object({
  payeeName: z.string().min(1),
  payeePin: z.string().optional(),
  category: z.string().min(1),
  resident: z.boolean().default(true),
  grossAmount: z.number().positive(),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
});

// POST — record a payment; WHT amount computed from the company's rate table.
export const POST = handler(async (req) => {
  const { session, companyId } = await requireCompany("payroll.rates.edit");
  const body = createSchema.parse(await json(req));
  const rate = await prisma.whtRate.findUnique({
    where: {
      companyId_category_resident: {
        companyId,
        category: body.category,
        resident: body.resident,
      },
    },
  });
  if (!rate) {
    throw new ApiError(422, `No WHT rate set for "${body.category}" (${body.resident ? "resident" : "non-resident"}). Add it in Settings first.`);
  }
  const payment = await prisma.whtPayment.create({
    data: {
      companyId,
      payeeName: body.payeeName,
      payeePin: body.payeePin,
      category: body.category,
      resident: body.resident,
      grossAmount: body.grossAmount,
      whtAmount: Math.round(body.grossAmount * Number(rate.rate) * 100) / 100,
      paidOn: new Date(body.paidOn),
    },
  });
  await logAudit({ userId: session.userId, companyId, action: "wht.payment.add", detail: { id: payment.id, payee: body.payeeName } });
  return payment;
});

// DELETE /api/wht-payments?id=...
export const DELETE = handler(async (req) => {
  const { session, companyId } = await requireCompany("payroll.rates.edit");
  const id = new URL(req.url).searchParams.get("id");
  if (!id) throw new ApiError(400, "id is required");
  const existing = await prisma.whtPayment.findFirst({ where: { id, companyId } });
  if (!existing) throw new ApiError(404, "Payment not found");
  await prisma.whtPayment.delete({ where: { id } });
  await logAudit({ userId: session.userId, companyId, action: "wht.payment.delete", detail: { id } });
  return { deleted: true };
});
