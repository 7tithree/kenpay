import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, createSession } from "@/lib/auth";
import { handler, json } from "@/lib/api";
import { ROLE_PRESETS } from "@/lib/permissions";
import { KENYA_DEFAULT_DEDUCTIONS, KENYA_DEFAULT_WHT } from "@/lib/payroll-engine";

// Auth routes read cookies, so they can never be statically rendered.
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const session = await requireAuth();
  const memberships = await prisma.membership.findMany({
    where: { userId: session.userId },
    include: { company: { include: { branches: true } }, role: true },
  });
  return memberships.map((m: typeof memberships[number]) => ({ ...m.company, role: m.role.name }));
});

const schema = z.object({
  name: z.string().min(2),
  kraPin: z.string().optional(),
  address: z.string().optional(),
});

// Creating a company makes the creator its Admin and seeds Kenyan statutory
// deductions + WHT rates (all editable afterwards).
export const POST = handler(async (req) => {
  const session = await requireAuth();
  const body = schema.parse(await json(req));

  const company = await prisma.$transaction(async (tx: any) => {
    const company = await tx.company.create({ data: body });
    const roles = await Promise.all(
      Object.entries(ROLE_PRESETS).map(([name, permissions]) =>
        tx.role.create({ data: { companyId: company.id, name, permissions } })
      )
    );
    const admin = roles.find((r) => r.name === "Admin")!;
    await tx.membership.create({
      data: { userId: session.userId, companyId: company.id, roleId: admin.id },
    });
    for (const d of KENYA_DEFAULT_DEDUCTIONS) {
      await tx.deduction.create({
        data: {
          companyId: company.id,
          name: d.name,
          statutory: d.statutory,
          method: d.method as any,
          point: d.point as any,
          rate: (d as any).rate ?? null,
          capAmount: (d as any).capAmount ?? null,
          relief: (d as any).relief ?? null,
          employerRate: (d as any).employerRate ?? null,
          preTax: d.preTax,
          pension: (d as any).pension ?? false,
          tiers: (d as any).tiers ?? undefined,
        },
      });
    }
    await tx.whtRate.createMany({
      data: KENYA_DEFAULT_WHT.map((w) => ({ ...w, companyId: company.id })),
    });
    await tx.employmentType.createMany({
      data: ["Permanent", "Contractual", "Casual", "Intern"].map((name) => ({
        companyId: company.id,
        name,
      })),
    });
    return company;
  });

  // Switch the session to the new company
  await createSession({ ...session, activeCompanyId: company.id });
  return company;
});
