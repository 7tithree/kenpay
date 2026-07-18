import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, createSession, ApiError } from "@/lib/auth";
import { handler, json } from "@/lib/api";

export const POST = handler(async (req) => {
  const session = await requireAuth();
  const { companyId } = z.object({ companyId: z.string() }).parse(await json(req));
  const membership = await prisma.membership.findUnique({
    where: { userId_companyId: { userId: session.userId, companyId } },
  });
  if (!membership) throw new ApiError(403, "You are not a member of that company");
  await createSession({ ...session, activeCompanyId: companyId });
  return { activeCompanyId: companyId };
});
