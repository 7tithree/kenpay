import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiError } from "./auth";

/**
 * Wrap a route handler so every route gets consistent error handling.
 * Usage: export const POST = handler(async (req) => { ... return data; });
 */
export function handler<T>(fn: (req: Request, ctx: any) => Promise<T>) {
  return async (req: Request, ctx: any) => {
    try {
      const data = await fn(req, ctx);
      return NextResponse.json({ ok: true, data });
    } catch (err: any) {
      if (err instanceof ApiError) {
        return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
      }
      if (err instanceof ZodError) {
        return NextResponse.json(
          { ok: false, error: "Validation failed", issues: err.flatten().fieldErrors },
          { status: 422 }
        );
      }
      // Prisma unique constraint
      if (err?.code === "P2002") {
        return NextResponse.json(
          { ok: false, error: "A record with those details already exists" },
          { status: 409 }
        );
      }
      console.error(err);
      return NextResponse.json({ ok: false, error: "Something went wrong" }, { status: 500 });
    }
  };
}

export async function json(req: Request) {
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, "Invalid JSON body");
  }
}
