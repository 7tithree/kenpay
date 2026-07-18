import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword, createSession, ApiError } from "@/lib/auth";
import { handler, json } from "@/lib/api";
import { checkRateLimit, recordFailure, resetRateLimit } from "@/lib/rate-limit";

const schema = z.object({ email: z.string().email(), password: z.string() });

const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

export const POST = handler(async (req) => {
  const body = schema.parse(await json(req));
  const email = body.email.toLowerCase();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const key = `login:${ip}:${email}`;

  const { limited, retryAfterMs } = checkRateLimit(key, MAX_FAILED_ATTEMPTS);
  if (limited) {
    const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));
    throw new ApiError(
      429,
      `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { memberships: true },
  });
  if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
    recordFailure(key, WINDOW_MS);
    throw new ApiError(401, "Invalid email or password");
  }
  resetRateLimit(key);

  // Auto-select first company if the user has exactly one
  const activeCompanyId = user.memberships.length === 1 ? user.memberships[0].companyId : null;
  await createSession({
    userId: user.id,
    email: user.email,
    name: user.name,
    activeCompanyId,
    tokenVersion: user.tokenVersion,
  });
  return { id: user.id, name: user.name, activeCompanyId };
});
