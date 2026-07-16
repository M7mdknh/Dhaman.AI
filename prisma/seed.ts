/**
 * Seed: demo users (one per role) and the three demo contractor companies.
 * Idempotent — safe to run repeatedly (upserts by unique keys).
 */
import "dotenv/config";
import bcrypt from "bcryptjs";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, UserRole } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL!),
});

// The demo password is a DEVELOPMENT convenience only. Never let it reach a
// production database — override with SEED_PASSWORD if this seed is ever run
// against a non-dev environment on purpose.
const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? "Daman!2026";

// The Risk Officer's working login is retired for now: the RM absorbs the
// full review workflow and records a SUGGESTED decision instead (see
// RmSuggestedDecision) — the Risk Officer keeps the final say in the schema
// and services, but has no seeded account to log in with. Both bank-side
// demo accounts are RELATIONSHIP_MANAGER; the person and email are kept.
const USERS: { email: string; fullName: string; role: UserRole }[] = [
  { email: "admin@daman.local", fullName: "Nawaf Alharthi", role: "ADMIN" },
  { email: "rm@daman.local", fullName: "Salman Alghamdi", role: "RELATIONSHIP_MANAGER" },
  { email: "officer@daman.local", fullName: "Omar Alkaltham", role: "RELATIONSHIP_MANAGER" },
  { email: "contractor@daman.local", fullName: "Abdulrahman Yaghmour", role: "CONTRACTOR" },
];

const COMPANIES = [
  {
    crNumber: "1010111111",
    name: "Rawabi Contracting Co.",
    sector: "General Construction",
    city: "Riyadh",
    contactPerson: "Abdulrahman Yaghmour",
    contactEmail: "contractor@daman.local",
    phone: "+966 50 111 1111",
  },
  {
    crNumber: "2050222222",
    name: "Nimah Construction & Trading",
    sector: "Infrastructure",
    city: "Jeddah",
    contactPerson: "Mona Al-Zahrani",
    contactEmail: "info@nimah.example",
    phone: "+966 55 222 2222",
  },
  {
    crNumber: "4030333333",
    name: "Faisal Trading & Contracting Est.",
    sector: "Building Materials",
    city: "Dammam",
    contactPerson: "Faisal Al-Dossary",
    contactEmail: "office@faisal-est.example",
    phone: "+966 53 333 3333",
  },
];

async function main() {
  // Guard: these are well-known demo accounts (incl. ADMIN) with a password
  // that lives in this committed file. They must NEVER be created in a
  // production database. Running the seed there requires a deliberate
  // ALLOW_PROD_SEED=true, which a real production pipeline should never set.
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_SEED !== "true") {
    throw new Error(
      "Refusing to seed demo accounts in a production environment. " +
        "Set ALLOW_PROD_SEED=true only if you fully intend to.",
    );
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // Companies first — the demo contractor belongs to one.
  const companies = [];
  for (const company of COMPANIES) {
    companies.push(
      await prisma.company.upsert({
        where: { crNumber: company.crNumber },
        update: { ...company },
        create: company,
      }),
    );
  }

  for (const user of USERS) {
    // Contractors belong to their company; bank staff have none.
    const companyId = user.role === "CONTRACTOR" ? companies[0].id : null;
    await prisma.user.upsert({
      where: { email: user.email },
      update: { fullName: user.fullName, role: user.role, companyId },
      create: { ...user, passwordHash, companyId },
    });
  }

  console.log(`Seeded ${USERS.length} users and ${COMPANIES.length} companies.`);
  console.log(`Demo password for all users: ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
