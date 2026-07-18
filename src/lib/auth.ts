import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import type { PermissionKey } from "./permissions";

// Validated lazily (not at module load) because `next build` imports every
// route with NODE_ENV=production while collecting page data; the check must
// only fire when a session is actually signed or verified at runtime.
let secretBytes: Uint8Array | null = null;
function getSecret(): Uint8Array {
  if (!secretBytes) {
    const raw = process.env.AUTH_SECRET;
    if (
      process.env.NODE_ENV === "production" &&
      (!raw || raw.length < 32 || raw.includes("change-me"))
    ) {
      throw new Error(
        "AUTH_SECRET must be set to a random string of at least 32 characters in production " +
          "(e.g. `openssl rand -base64 48`). Refusing to run with a guessable session key."
      );
    }
    secretBytes = new TextEncoder().encode(raw ?? "dev-secret-change-me");
  }
  return secretBytes;
}
const COOKIE = "kenpay_session";

export type Session = {
  userId: string;
  email: string;
  name: string;
  activeCompanyId: string | null; // company switching lives here
  tokenVersion: number; // must match User.tokenVersion or the session is revoked
};

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}
export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSession(session: Session) {
  const token = await new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("12h")
    .sign(getSecret());
  const cookieStore = await cookies();
  cookieStore.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const session = payload as unknown as Session;
    // Revocation check: a JWT is only valid while its tokenVersion matches the
    // user's current one, so bumping User.tokenVersion invalidates every
    // outstanding session (logout everywhere, password change/reset).
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { tokenVersion: true },
    });
    if (!user || user.tokenVersion !== (session.tokenVersion ?? 0)) return null;
    return session;
  } catch {
    return null;
  }
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE);
}

/** Invalidate every outstanding session for a user, on all devices. */
export async function revokeAllSessions(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  });
}

/**
 * Guard for API routes. Verifies session, active company membership,
 * and (optionally) a required permission. Throws ApiError on failure.
 */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function requireAuth() {
  const session = await getSession();
  if (!session) throw new ApiError(401, "Not signed in");
  return session;
}

export async function requireCompany(permission?: PermissionKey) {
  const session = await requireAuth();
  if (!session.activeCompanyId) throw new ApiError(400, "No active company selected");
  const membership = await prisma.membership.findUnique({
    where: { userId_companyId: { userId: session.userId, companyId: session.activeCompanyId } },
    include: { role: true },
  });
  if (!membership) throw new ApiError(403, "You are not a member of this company");
  if (permission && !membership.role.permissions.includes(permission)) {
    throw new ApiError(403, `Missing permission: ${permission}`);
  }
  return { session, companyId: session.activeCompanyId, membership };
}
