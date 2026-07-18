// Optional demo seed: creates a demo admin user. Companies (with statutory
// deductions) are created from the UI, which seeds them automatically.
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

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
