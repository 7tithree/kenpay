// Tops up existing preset roles (Admin, Payroll Officer, Approver, Viewer)
// with any permissions added to ROLE_PRESETS since the roles were created.
// Custom permissions already on a role are kept (union, never removes).
// Run with: npx tsx scripts/sync-role-permissions.ts
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ROLE_PRESETS } from "../src/lib/permissions";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const roles = await prisma.role.findMany();
  let updated = 0;
  for (const role of roles) {
    const preset = ROLE_PRESETS[role.name];
    if (!preset) continue; // custom role — leave untouched
    const merged = Array.from(new Set([...role.permissions, ...preset]));
    if (merged.length !== role.permissions.length) {
      await prisma.role.update({ where: { id: role.id }, data: { permissions: merged } });
      console.log(`Updated "${role.name}" (${role.companyId}): +${merged.length - role.permissions.length} permission(s)`);
      updated++;
    }
  }
  console.log(updated ? `Done — ${updated} role(s) updated.` : "All preset roles already up to date.");
}

main().finally(() => prisma.$disconnect());
