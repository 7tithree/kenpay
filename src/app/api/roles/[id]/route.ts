import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCompany, ApiError } from "@/lib/auth";
import { handler, json } from "@/lib/api";
import { PERMISSIONS } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  name: z.string().min(2).optional(),
  permissions: z.array(z.string()).optional(),
});

// PATCH /api/roles/:id — rename a role or change its permissions
export const PATCH = handler(async (req, { params }) => {
  const { session, companyId, membership } = await requireCompany(PERMISSIONS.COMPANY_ASSIGN_ROLES);
  const body = schema.parse(await json(req));
  const role = await prisma.role.findFirst({ where: { id: params.id, companyId } });
  if (!role) throw new ApiError(404, "Role not found");

  // Safety: you can't strip role-management rights from your own role,
  // otherwise a company can lock itself out of role administration.
  if (
    membership.roleId === role.id &&
    body.permissions &&
    !body.permissions.includes(PERMISSIONS.COMPANY_ASSIGN_ROLES)
  ) {
    throw new ApiError(422, "You cannot remove role-management permission from your own role");
  }

  const updated = await prisma.role.update({ where: { id: role.id }, data: body });
  await logAudit({
    userId: session.userId,
    companyId,
    action: "role.edit",
    detail: { role: role.name, changes: body },
  });
  return updated;
});

// DELETE /api/roles/:id — only if no member currently holds it
export const DELETE = handler(async (_req, { params }) => {
  const { session, companyId } = await requireCompany(PERMISSIONS.COMPANY_ASSIGN_ROLES);
  const role = await prisma.role.findFirst({
    where: { id: params.id, companyId },
    include: { _count: { select: { memberships: true } } },
  });
  if (!role) throw new ApiError(404, "Role not found");
  if (role._count.memberships > 0) {
    throw new ApiError(409, `"${role.name}" is assigned to ${role._count.memberships} member(s). Reassign them first.`);
  }
  await prisma.role.delete({ where: { id: role.id } });
  await logAudit({ userId: session.userId, companyId, action: "role.delete", detail: { role: role.name } });
  return { deleted: true };
});
