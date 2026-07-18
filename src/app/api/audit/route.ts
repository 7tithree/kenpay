import { prisma } from "@/lib/db";
import { requireCompany } from "@/lib/auth";
import { handler } from "@/lib/api";

// Auth routes read cookies, so they can never be statically rendered.
export const dynamic = "force-dynamic";

// GET /api/audit?take=100 — recent audit trail for the active company.
export const GET = handler(async (req) => {
  const { companyId } = await requireCompany("company.view");
  const take = Math.min(Number(new URL(req.url).searchParams.get("take") ?? 100), 500);
  const logs = await prisma.auditLog.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    take,
    include: { user: { select: { name: true, email: true } } },
  });
  return logs;
});
