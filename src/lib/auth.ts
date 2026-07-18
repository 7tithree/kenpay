import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import type { PermissionKey } from "./permissions";

const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET ?? "dev-secret-change-me");
const COOKIE = "kenpay_session";

export type Session = {
  userId: string;
  email: string;
  name: string;
  activeCompanyId: string | null; // company switching lives here
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
    .sign(SECRET);
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
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE);
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
