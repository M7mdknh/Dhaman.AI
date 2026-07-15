/**
 * DEV TOOL: finds cases whose status promises an underwriting assessment the
 * engine will not produce, and reprocesses them through the REAL pipeline so
 * they land in an honest state.
 *
 * Why this exists: the Financial Integrity Validator can start rejecting data
 * that an older, more permissive pipeline accepted. Those cases keep an
 * ANALYSIS_READY badge over an empty analysis — a case that says "ready" but
 * shows nothing is worse than one that says "we couldn't verify this".
 *
 * SAFE BY CONSTRUCTION:
 *   - Read-only by default; pass --apply to act.
 *   - Never writes a status directly. It calls the same `retryProcessing` +
 *     `runCaseProcessing` path the contractor's "Resume Processing" button
 *     uses, so the outcome, audit trail and failure reason are whatever the
 *     real pipeline decides — this script has no opinion of its own.
 *   - Extraction is checkpointed: verified documents are never re-read and no
 *     paid AI call is repeated.
 *   - Cases with a decision or an issued guarantee are never touched.
 *
 *   npx tsx scripts/reconcile-case-states.mts          # report only
 *   npx tsx scripts/reconcile-case-states.mts --apply  # reprocess
 */
import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { runCaseProcessing, retryProcessing } from "@/services/case-processing-service";
import { buildFinancialIntelligence } from "@/services/finance/financial-intelligence-service";

const APPLY = process.argv.includes("--apply");

/** Statuses that tell a user "there is an assessment to look at". */
const PROMISES_ASSESSMENT = new Set([
  "ANALYSIS_READY",
  "RM_REVIEWED",
  "UNDER_REVIEW",
  "INFO_REQUESTED",
]);

/** A run that died mid-flight is stuck RUNNING and will never resolve itself. */
const STALE_RUNNING_MS = 90 * 1000;

const cases = await prisma.underwritingCase.findMany({
  include: {
    financialStatements: true,
    contractDetails: true,
    processing: true,
    officerDecisions: { select: { id: true } },
    guarantee: { select: { reference: true } },
  },
  orderBy: { createdAt: "asc" },
});

interface Target {
  id: string;
  reference: string;
  ownerId: string;
  why: string;
}

const targets: Target[] = [];
for (const c of cases) {
  // A decided or issued case is a record of what a human concluded. Never
  // reprocess it — reconciling history is not this script's business.
  if (c.officerDecisions.length > 0 || c.guarantee) continue;
  if (!c.processing) continue;

  const report = buildFinancialIntelligence(c.financialStatements, c.contractDetails);
  const stale =
    c.processing.state === "RUNNING" &&
    Date.now() - c.processing.updatedAt.getTime() > STALE_RUNNING_MS;

  if (PROMISES_ASSESSMENT.has(c.status) && report === null) {
    targets.push({
      id: c.id,
      reference: c.reference,
      ownerId: c.createdById,
      why: `status ${c.status} but the engine produces no assessment`,
    });
  } else if (stale) {
    const age = Math.round((Date.now() - c.processing.updatedAt.getTime()) / 3.6e6);
    targets.push({
      id: c.id,
      reference: c.reference,
      ownerId: c.createdById,
      why: `processing stuck RUNNING for ${age}h (the run died)`,
    });
  }
}

console.log(`${cases.length} cases scanned — ${targets.length} need reconciling\n`);
for (const t of targets) console.log(`  ${t.reference}: ${t.why}`);

if (targets.length === 0) {
  console.log("\n✅ every case is already consistent");
  await prisma.$disconnect();
  process.exit(0);
}

if (!APPLY) {
  console.log("\nRead-only. Re-run with --apply to reprocess these through the real pipeline.");
  await prisma.$disconnect();
  process.exit(0);
}

console.log("\nReprocessing…\n");
for (const t of targets) {
  const retry = await retryProcessing(t.ownerId, t.id);
  if (!retry.ok) {
    console.log(`  ✗ ${t.reference}: could not re-arm — ${retry.error}`);
    continue;
  }
  await runCaseProcessing(t.id);
  const after = await prisma.underwritingCase.findUniqueOrThrow({
    where: { id: t.id },
    select: { status: true, processing: { select: { state: true, error: true } } },
  });
  console.log(`  ✓ ${t.reference}: ${after.status} (job ${after.processing?.state})`);
  if (after.processing?.error) {
    console.log(`      reason: ${after.processing.error.slice(0, 150)}`);
  }
}

await prisma.$disconnect();
