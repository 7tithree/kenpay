import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Redirect unauthenticated users away from the dashboard.
// (Fine-grained permission checks happen in each API route.)
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has("kenpay_session");
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/dashboard") && !hasSession) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (pathname === "/login" && hasSession) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*", "/login"] };
