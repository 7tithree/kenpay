import { clearSession, getSession, revokeAllSessions } from "@/lib/auth";
import { handler } from "@/lib/api";

// POST {} logs out this device; POST { everywhere: true } also revokes every
// other outstanding session for the user (e.g. a stolen or forgotten login).
export const POST = handler(async (req) => {
  const body = await req.json().catch(() => ({}));
  if (body?.everywhere === true) {
    const session = await getSession();
    if (session) await revokeAllSessions(session.userId);
  }
  await clearSession();
  return { loggedOut: true };
});
