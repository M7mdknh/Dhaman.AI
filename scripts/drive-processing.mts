/** Drives the REAL processing pipeline against a seeded case and reports wall time. */
import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { runCaseProcessing } from "@/services/case-processing-service";

async function main() {
  // Warm 5 connections exactly like instrumentation.register() does at boot.
  const w = Date.now();
  await Promise.all(Array.from({ length: 5 }, () => prisma.$queryRaw`SELECT 1`));
  console.log(`pool warm (5 conns): ${Date.now() - w}ms\n`);

  // A case that has documents + a contract (so the engine can run).
  const c = await prisma.underwritingCase.findFirst({
    where: { documents: { some: { docType: "FINANCIAL_STATEMENT" } }, contractDetails: { isNot: null } },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });
  if (!c) {
    console.log("No seeded case with documents + contract found. Run: npx tsx scripts/seed-demo-cases.mts");
    await prisma.$disconnect();
    return;
  }

  const reset = async () => {
    await prisma.caseProcessing.upsert({
      where: { caseId: c.id },
      create: { caseId: c.id, state: "QUEUED", queuedAt: new Date() },
      update: { state: "QUEUED", stage: null, failedStage: null, error: null, startedAt: null, completedAt: null, queuedAt: new Date() },
    });
    await prisma.underwritingCase.update({ where: { id: c.id }, data: { status: "SUBMITTED" } });
  };

  // Two consecutive runs: the second reflects a fully warm, steady-state pool
  // (what a judge's request sees on a long-running server after boot warmup).
  for (const label of ["run 1 (warm pool)", "run 2 (steady state)"]) {
    await reset();
    console.log(`\n===== ${label} — case ${c.id} (UNDERWRITING_MODE=${process.env.UNDERWRITING_MODE ?? "express"}) =====`);
    const t = Date.now();
    await runCaseProcessing(c.id);
    console.log(`>>> runCaseProcessing wall time: ${Date.now() - t}ms`);
    const after = await prisma.underwritingCase.findUnique({
      where: { id: c.id },
      select: { status: true, processing: { select: { state: true, stage: true } } },
    });
    console.log(`>>> case.status=${after?.status}  job=${after?.processing?.state}/${after?.processing?.stage}`);
  }

  await prisma.$disconnect();
}

void main();
