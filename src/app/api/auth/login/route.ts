import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword, createSession, ApiError } from "@/lib/auth";
import { handler, json } from "@/lib/api";

const schema = z.object({ email: z.string().email(), password: z.string() });

export const POST = handler(async (req) => {
  const body = schema.parse(await json(req));
  const user = await prisma.user.findUnique({
    where: { email: body.email.toLowerCase() },
    include: { memberships: true },
  });
  if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
    throw new ApiError(401, "Invalid email or password");
  }
  // Auto-select first company if the user has exactly one
  const activeCompanyId = user.memberships.length === 1 ? user.memberships[0].companyId : null;
  await createSession({ userId: user.id, email: user.email, name: user.name, activeCompanyId });
  return { id: user.id, name: user.name, activeCompanyId };
});
