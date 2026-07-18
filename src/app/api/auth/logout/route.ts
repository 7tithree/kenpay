import { clearSession } from "@/lib/auth";
import { handler } from "@/lib/api";

export const POST = handler(async () => {
  clearSession();
  return { loggedOut: true };
});
