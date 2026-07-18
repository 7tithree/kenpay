import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { handler } from "@/lib/api";

// Auth routes read cookies, so they can never be statically rendered.
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const session = await requireAuth();
  const memberships = await prisma.membership.findMany({
    where: { userId: session.userId },
    include: { company: true, role: true },
  });
  return {
    user: { id: session.userId, name: session.name, email: session.email },
    activeCompanyId: session.activeCompanyId,
    companies: memberships.map((m: typeof memberships[number]) => ({
      id: m.company.id,
      name: m.company.name,
      role: m.role.name,
      permissions: m.role.permissions,
    })),
  };
});
