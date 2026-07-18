import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, createSession } from "@/lib/auth";
import { handler, json } from "@/lib/api";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const POST = handler(async (req) => {
  const body = schema.parse(await json(req));
  const user = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email.toLowerCase(),
      passwordHash: await hashPassword(body.password),
    },
  });
  await createSession({ userId: user.id, email: user.email, name: user.name, activeCompanyId: null });
  return { id: user.id, email: user.email, name: user.name };
});
