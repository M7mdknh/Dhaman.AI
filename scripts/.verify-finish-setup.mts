import "dotenv/config";
import { writeFileSync } from "node:fs";

import { prisma } from "@/lib/prisma";
import { retryProcessing, runCaseProcessing } from "@/services/case-processing-service";

const contractor = await prisma.user.findUniqueOrThrow({
  where: { email: "contractor@daman.local" },
});

const qaCases = await prisma.underwritingCase.findMany({
  where: {
    createdById: contractor.id,
    OR: [
      { contractDetails: { contractTitle: { startsWith: "QA Verification" } } },
      { status: "DRAFT" },
    ],
  },
  include: {
    processing: true,
    documents: { select: { fileName: true, processingStatus: true, fiscalYear: true } },
  },
  orderBy: { createdAt: "asc" },
});

for (const c of qaCases) {
  console.log(
    `${c.reference} ${c.id} status=${c.status} job=${c.processing?.state ?? "-"} docs=[${c.documents
      .map((d) => `${d.fiscalYear}:${d.processingStatus}`)
      .join(", ")}]`,
  );
}

const caseA = qaCases.find((c) => c.status === "PROCESSING" && c.documents.length === 1);
const caseB = qaCases.find((c) => c.status === "DRAFT" && c.documents.length === 0);
const caseC = qaCases.find((c) => c.documents.length === 2);
const caseD = qaCases.find(
  (c) => c.documents.length === 1 && c.documents[0]!.fileName.includes("garbage-only"),
);
if (!caseA || !caseB || !caseC || !caseD) throw new Error("could not identify QA cases");

// ---- finish Case D: verify graceful failure, then retry ----
const job1 = await prisma.caseProcessing.findUniqueOrThrow({ where: { caseId: caseD.id } });
console.log(
  `CASE D run 1: case=${caseD.status} job=${job1.state} failedStage=${job1.failedStage} attempts=${job1.attempts}\n  error="${job1.error}"`,
);

const retried = await retryProcessing(contractor.id, caseD.id);
const job2 = await prisma.caseProcessing.findUniqueOrThrow({ where: { caseId: caseD.id } });
console.log(`CASE D retry accepted=${retried.ok} job=${job2.state} attempts=${job2.attempts}`);
await runCaseProcessing(caseD.id);
const job3 = await prisma.caseProcessing.findUniqueOrThrow({ where: { caseId: caseD.id } });
const case3 = await prisma.underwritingCase.findUniqueOrThrow({ where: { id: caseD.id } });
console.log(
  `CASE D after retry: case=${case3.status} job=${job3.state} attempts=${job3.attempts}\n  error="${job3.error}"`,
);

writeFileSync(
  "/tmp/claude-1000/-home-muhammad-Documents-Wakeel-AI-Wakeel-V2/6e751863-b034-42b5-9f59-eb8b35f3a97b/scratchpad/verify-cases.json",
  JSON.stringify(
    {
      caseA: { caseId: caseA.id, reference: caseA.reference },
      caseB: { caseId: caseB.id, reference: caseB.reference },
      caseC: {
        caseId: caseC.id,
        reference: caseC.reference,
        status: caseC.status,
        docs: caseC.documents.map((d) => `${d.fiscalYear}:${d.fileName}=${d.processingStatus}`),
      },
      caseD: {
        caseId: caseD.id,
        reference: caseD.reference,
        firstRun: { job: job1.state, failedStage: job1.failedStage, attempts: job1.attempts, error: job1.error },
        retryAccepted: retried.ok,
        afterRetry: { case: case3.status, job: job3.state, attempts: job3.attempts, error: job3.error },
      },
    },
    null,
    2,
  ),
);
console.log("FINISH-SETUP OK");
await prisma.$disconnect();
