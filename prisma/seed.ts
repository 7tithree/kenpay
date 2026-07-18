// Optional demo seed: creates a demo admin user. Companies (with statutory
// deductions) are created from the UI, which seeds them automatically.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("Password123!", 10);
  await prisma.user.upsert({
    where: { email: "admin@demo.co.ke" },
    update: {},
    create: { email: "admin@demo.co.ke", name: "Demo Admin", passwordHash },
  });
  console.log("Seeded demo user: admin@demo.co.ke / Password123!");
}

main().finally(() => prisma.$disconnect());
