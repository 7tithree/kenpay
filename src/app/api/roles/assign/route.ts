import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCompany, ApiError } from "@/lib/auth";
import { handler, json } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";

const schema = z.object({ email: z.string().email(), roleId: z.string() });

// Assign a role to a user (adds them to the active company if not a member)
export const POST = handler(async (req) => {
  const { companyId } = await requireCompany(PERMISSIONS.COMPANY_ASSIGN_ROLES);
  const body = schema.parse(await json(req));
  const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
  if (!user) throw new ApiError(404, "No user with that email — ask them to register first");
  const role = await prisma.role.findFirst({ where: { id: body.roleId, companyId } });
  if (!role) throw new ApiError(404, "Role not found in this company");
  return prisma.membership.upsert({
    where: { userId_companyId: { userId: user.id, companyId } },
    update: { roleId: role.id },
    create: { userId: user.id, companyId, roleId: role.id },
  });
});
