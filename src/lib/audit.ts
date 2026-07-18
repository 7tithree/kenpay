import { prisma } from "./db";

/**
 * Write an audit-trail entry. Fire-and-forget safe: audit failures must never
 * break the action being audited, so errors are swallowed (but logged).
 */
export async function logAudit(opts: {
  userId?: string | null;
  companyId?: string | null;
  action: string; // e.g. "payroll.run", "payroll.approve", "rates.edit"
  detail?: Record<string, unknown>;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: opts.userId ?? null,
        companyId: opts.companyId ?? null,
        action: opts.action,
        detail: (opts.detail ?? {}) as any,
      },
    });
  } catch (err) {
    console.error("audit log failed", err);
  }
}
