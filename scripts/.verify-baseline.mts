import "dotenv/config";
import { prisma } from "@/lib/prisma";

const cases = await prisma.underwritingCase.findMany({
  select: {
    id: true,
    reference: true,
    status: true,
    company: { select: { name: true } },
  },
  orderBy: { createdAt: "asc" },
});
console.log("CASES:");
for (const c of cases) console.log(` ${c.reference} | ${c.company?.name} | ${c.status} | ${c.id}`);

const users = await prisma.user.findMany({ select: { email: true, role: true, fullName: true } });
console.log("USERS:");
for (const u of users) console.log(` ${u.email} | ${u.role} | ${u.fullName}`);

const guarantees = await prisma.guarantee.count();
console.log("GUARANTEES:", guarantees);
await prisma.$disconnect();
