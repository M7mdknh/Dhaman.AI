/**
 * QA VERIFICATION E2E — drives the running production server (localhost:3111)
 * through the complete four-role lifecycle with Playwright, recording
 * PASS/FAIL evidence, timings, and screenshots to docs/verification/.
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";

import { chromium, type BrowserContext, type Page } from "playwright";

import { prisma } from "@/lib/prisma";

const BASE = "http://localhost:3111";
const PASSWORD = "Daman!2026";
const SHOTS = "docs/verification";
const SCRATCH =
  "/tmp/claude-1000/-home-muhammad-Documents-Wakeel-AI-Wakeel-V2/6e751863-b034-42b5-9f59-eb8b35f3a97b/scratchpad";

const state = JSON.parse(readFileSync(`${SCRATCH}/verify-cases.json`, "utf8"));
const caseA: string = state.caseA.caseId;
const refA: string = state.caseA.reference;
const caseB: string = state.caseB.caseId;
const NIMAH_CASE = "cmrny8bch000lfmomr1dcq8zg"; // another contractor's case

interface Evidence {
  area: string;
  test: string;
  expected: string;
  actual: string;
  pass: boolean;
}
const evidence: Evidence[] = [];
const metrics: Record<string, number | string> = {};
const consoleErrors: string[] = [];

function record(area: string, test: string, expected: string, actual: string, pass: boolean) {
  evidence.push({ area, test, expected, actual, pass });
  console.log(`${pass ? "PASS" : "FAIL"} [${area}] ${test} — expected: ${expected} | actual: ${actual}`);
}

function watch(page: Page, label: string) {
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(`[${label}] ${m.text().slice(0, 300)}`);
  });
  page.on("pageerror", (e) => consoleErrors.push(`[${label}] pageerror: ${String(e).slice(0, 300)}`));
}

async function login(ctx: BrowserContext, email: string, label: string): Promise<Page> {
  const page = await ctx.newPage();
  watch(page, label);
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard", { timeout: 30_000 });
  await page.waitForSelector("text=Welcome,", { timeout: 30_000 });
  return page;
}

async function caseStatus(id: string): Promise<string> {
  const c = await prisma.underwritingCase.findUniqueOrThrow({ where: { id } });
  return c.status;
}

async function waitForStatus(id: string, wanted: string[], timeoutMs: number): Promise<string> {
  const t0 = Date.now();
  for (;;) {
    const s = await caseStatus(id);
    if (wanted.includes(s)) return s;
    if (Date.now() - t0 > timeoutMs) return s;
    await new Promise((r) => setTimeout(r, 2500));
  }
}

const browser = await chromium.launch();

// ════════ 1. Authentication & unauthenticated access ════════
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  watch(page, "unauth");
  await page.goto(`${BASE}/dashboard`);
  await page.waitForLoadState("networkidle");
  const url = page.url();
  record(
    "Authentication",
    "Unauthenticated user opens /dashboard",
    "redirected to /login",
    url.includes("/login") ? "redirected to /login" : `stayed on ${url}`,
    url.includes("/login"),
  );
  const apiRes = await page.request.get(`${BASE}/api/cases/${caseA}/processing`);
  record(
    "Authentication",
    "Unauthenticated API call to processing endpoint",
    "401",
    String(apiRes.status()),
    apiRes.status() === 401,
  );
  const badLogin = await ctx.newPage();
  watch(badLogin, "badlogin");
  await badLogin.goto(`${BASE}/login`);
  await badLogin.fill('input[type="email"]', "contractor@daman.local");
  await badLogin.fill('input[type="password"]', "wrong-password");
  await badLogin.getByRole("button", { name: "Sign in" }).click();
  await badLogin.waitForTimeout(4000);
  const still = badLogin.url().includes("/login");
  record(
    "Authentication",
    "Login with wrong password",
    "rejected, stays on /login",
    still ? "rejected, stayed on /login" : `navigated to ${badLogin.url()}`,
    still,
  );
  await ctx.close();
}

// ════════ 2. Contractor workflow ════════
const contractorCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
{
  const t0 = Date.now();
  const page = await login(contractorCtx, "contractor@daman.local", "contractor");
  metrics.loginToDashboardMs = Date.now() - t0;
  record(
    "Contractor",
    "Login as contractor@daman.local",
    "dashboard renders with welcome header",
    `dashboard rendered in ${metrics.loginToDashboardMs}ms`,
    true,
  );
  await page.screenshot({ path: `${SHOTS}/01-contractor-dashboard.png` });

  // Case A: the browser poll triggers the real server-side pipeline run.
  const tPipe = Date.now();
  await page.goto(`${BASE}/cases/${caseA}`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${SHOTS}/02-processing-live.png` });
  const finalStatus = await waitForStatus(caseA, ["ANALYSIS_READY", "PROCESSING_FAILED"], 300_000);
  metrics.pipelineViaServerMs = Date.now() - tPipe;
  record(
    "Queue & Pipeline",
    `Case A (${refA}) processed by the live server (poll-triggered)`,
    "ANALYSIS_READY",
    `${finalStatus} after ${metrics.pipelineViaServerMs}ms`,
    finalStatus === "ANALYSIS_READY",
  );
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/03-contractor-analysis-ready.png`, fullPage: false });

  // ── Presigned direct-to-R2 upload on draft case B ──
  const pdf = readFileSync(`${SCRATCH}/qa-upload.pdf`);
  const tPresign = Date.now();
  const presign = await page.request.post(`${BASE}/api/cases/${caseB}/documents/presign`, {
    data: {
      fileName: "qa-presign-2024.pdf",
      fileSize: pdf.length,
      fileType: "application/pdf",
      fiscalYear: 2024,
    },
  });
  const presignMs = Date.now() - tPresign;
  const presignBody = presign.ok() ? await presign.json() : null;
  record(
    "Upload / R2",
    "Presign endpoint mints direct-to-storage URL",
    "200 with uploadUrl",
    `${presign.status()} uploadUrl=${presignBody?.uploadUrl ? "yes (direct)" : "null (server fallback)"} in ${presignMs}ms`,
    presign.ok(),
  );
  if (presignBody?.uploadUrl) {
    const tPut = Date.now();
    const put = await fetch(presignBody.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf" },
      body: pdf,
    });
    const putMs = Date.now() - tPut;
    metrics.r2PutMs = putMs;
    metrics.r2PutBytes = pdf.length;
    record(
      "Upload / R2",
      `Browser PUTs ${pdf.length} bytes straight to Cloudflare R2`,
      "2xx from R2",
      `${put.status} in ${putMs}ms`,
      put.ok,
    );
    const tFin = Date.now();
    const fin = await page.request.post(`${BASE}/api/cases/${caseB}/documents`, {
      data: {
        storageKey: presignBody.storageKey,
        fileName: "qa-presign-2024.pdf",
        fiscalYear: 2024,
      },
    });
    const finMs = Date.now() - tFin;
    const finBody = fin.ok() ? await fin.json() : await fin.text();
    record(
      "Upload / R2",
      "Finalize verifies the bytes in the bucket and registers the document",
      "2xx, document registered",
      `${fin.status()} in ${finMs}ms — ${JSON.stringify(finBody).slice(0, 120)}`,
      fin.ok(),
    );
  }

  // ── Contractor authorization boundaries ──
  await page.goto(`${BASE}/review/${caseA}`);
  await page.waitForLoadState("networkidle");
  const reviewBlocked =
    (await page.locator("text=/not found|404/i").count()) > 0 || page.url().includes("/login");
  record(
    "Authorization",
    "Contractor opens Risk Officer review desk /review/[id]",
    "404 not-found (role isolation)",
    reviewBlocked ? "blocked with not-found" : `rendered ${page.url()}`,
    reviewBlocked,
  );
  const guarRes = await page.request.get(`${BASE}/api/guarantees/${caseA}`);
  record(
    "Authorization",
    "Contractor requests guarantee PDF API",
    "denied (401/403/404)",
    String(guarRes.status()),
    guarRes.status() >= 400,
  );
  const chatRes = await page.request.post(`${BASE}/api/cases/${caseA}/chat`, {
    data: { message: "What is the risk score?" },
  });
  record(
    "Authorization",
    "Contractor calls Insight Chat API",
    "401 (bank-side only)",
    String(chatRes.status()),
    chatRes.status() === 401,
  );
  await page.goto(`${BASE}/cases/${NIMAH_CASE}`);
  await page.waitForLoadState("networkidle");
  const crossBlocked = (await page.locator("text=/not found|404/i").count()) > 0;
  record(
    "Authorization",
    "Contractor opens ANOTHER company's case",
    "404 not-found (tenant isolation)",
    crossBlocked ? "blocked with not-found" : "rendered",
    crossBlocked,
  );
}

// ════════ 3. Relationship Manager workflow ════════
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await login(ctx, "rm@daman.local", "rm");
  record("RM", "Login as rm@daman.local", "RM dashboard renders", "rendered", true);
  await page.screenshot({ path: `${SHOTS}/04-rm-dashboard.png` });

  await page.goto(`${BASE}/review/${caseA}`);
  await page.waitForLoadState("networkidle");

  // AI memo is drafted by the pipeline / lazily on first open — wait for it.
  const tMemo = Date.now();
  let memo = "";
  for (let i = 0; i < 40; i++) {
    memo = (await page.locator("#rm-summary").inputValue().catch(() => "")) ?? "";
    if (memo.trim().length > 50) break;
    await page.waitForTimeout(4000);
    await page.reload();
    await page.waitForLoadState("networkidle");
  }
  metrics.memoAvailableMs = Date.now() - tMemo;
  record(
    "Decision Intelligence",
    "AI executive summary reaches the RM desk",
    "non-empty AI-drafted memo",
    memo.trim().length > 50
      ? `memo present (${memo.trim().length} chars, ${metrics.memoAvailableMs}ms after open)`
      : "memo empty after 160s",
    memo.trim().length > 50,
  );

  // Financial Intelligence + Validation report screenshots
  const fiHeading = page.locator("text=/Financial Intelligence/i").first();
  if ((await fiHeading.count()) > 0) {
    await fiHeading.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/05-financial-intelligence.png` });
  }
  const valHeading = page.locator("text=/Validation|Integrity/i").first();
  const hasValidation = (await valHeading.count()) > 0;
  if (hasValidation) {
    await valHeading.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/06-validation-report.png` });
  }
  record(
    "Financial Integrity Validator",
    "Validation report renders on the review desk",
    "validation/integrity section visible",
    hasValidation ? "visible" : "not found",
    hasValidation,
  );

  // RM refines the memo (version-tracked) and routes with a suggestion.
  await page.locator("#rm-summary").scrollIntoViewIfNeeded();
  await page
    .locator("#rm-summary")
    .fill(memo + "\n\nRM note: long-standing Alinma relationship; conduct clean. (QA verification)");
  await page
    .locator("#rm-context")
    .fill("Client of the bank since 2019; three MOMRA packages completed without incident.");
  await page.locator('label:has(input[name="rm-suggested-decision"][value="APPROVE"])').click();
  await page
    .locator("#rm-decision-reason")
    .fill("Strong liquidity and clean track record support approval at the requested amount.");
  await page.screenshot({ path: `${SHOTS}/07-rm-review-desk.png` });
  await page.getByRole("button", { name: "Submit to Risk Officer" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Submit to Risk Officer" })
    .click();
  const rmStatus = await waitForStatus(caseA, ["RM_REVIEWED"], 30_000);
  record(
    "RM",
    "RM saves revision + suggested decision, routes to Risk Officer",
    "case status RM_REVIEWED",
    rmStatus,
    rmStatus === "RM_REVIEWED",
  );
  const revisions = await prisma.memoRevision.count({ where: { caseId: caseA } });
  record(
    "RM",
    "Memo refinement is version-tracked (AI original never mutated)",
    ">= 1 revision row",
    `${revisions} revision(s)`,
    revisions >= 1,
  );
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/08-rm-routed.png` });

  // RM must NOT see the officer decision form.
  const rmHasDecision = await page.getByRole("button", { name: "Record Decision" }).count();
  record(
    "Authorization",
    "RM desk exposes no final-decision controls",
    "no Record Decision button",
    rmHasDecision === 0 ? "absent" : "PRESENT",
    rmHasDecision === 0,
  );
  await ctx.close();
}

// ════════ 4. Admin (final decision) workflow ════════
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await login(ctx, "admin@daman.local", "admin");
  record("Admin", "Login as admin@daman.local", "admin dashboard renders", "rendered", true);
  await page.screenshot({ path: `${SHOTS}/09-admin-dashboard.png` });

  await page.goto(`${BASE}/review/${caseA}`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Start Review" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Start Review" }).click();
  const underReview = await waitForStatus(caseA, ["UNDER_REVIEW"], 30_000);
  record(
    "Risk Officer decision",
    "Start Review claims the case",
    "UNDER_REVIEW",
    underReview,
    underReview === "UNDER_REVIEW",
  );

  await page.waitForTimeout(1500);
  await page.locator('label:has(input[name="officer-decision"][value="APPROVE"])').click();
  await page
    .locator("#decision-reason")
    .fill("Deterministic analysis supports approval; RM suggestion concurs. (QA verification)");
  await page.screenshot({ path: `${SHOTS}/10-admin-decision-form.png` });
  await page.getByRole("button", { name: "Record Decision" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Confirm — Approve/ }).click();
  const approved = await waitForStatus(caseA, ["APPROVED"], 30_000);
  record(
    "Risk Officer decision",
    "Record Decision — Approve (with mandatory reason, confirmed in dialog)",
    "APPROVED",
    approved,
    approved === "APPROVED",
  );

  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Issue Guarantee" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Issue/ }).click();
  const issued = await waitForStatus(caseA, ["ISSUED"], 30_000);
  const guarantee = await prisma.guarantee.findUnique({ where: { caseId: caseA } });
  record(
    "Letter of Guarantee",
    "Issue Guarantee creates the bank instrument",
    "case ISSUED + guarantee row with reference",
    `${issued}, guarantee=${guarantee?.reference ?? "MISSING"}`,
    issued === "ISSUED" && !!guarantee,
  );
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/11-guarantee-issued.png` });

  // Letter of Guarantee PDF + analysis PDF
  const tLetter = Date.now();
  const letter = await page.request.get(`${BASE}/api/guarantees/${caseA}`);
  metrics.letterPdfMs = Date.now() - tLetter;
  const letterBytes = letter.ok() ? await letter.body() : Buffer.alloc(0);
  const letterIsPdf = letterBytes.subarray(0, 4).toString() === "%PDF";
  if (letterIsPdf) writeFileSync(`${SHOTS}/letter-of-guarantee.pdf`, letterBytes);
  record(
    "Letter of Guarantee",
    "Guarantee letter PDF downloads",
    "200, valid PDF",
    `${letter.status()}, ${letterBytes.length} bytes, %PDF=${letterIsPdf}, ${metrics.letterPdfMs}ms`,
    letter.ok() && letterIsPdf,
  );
  const tAnalysis = Date.now();
  const analysis = await page.request.get(`${BASE}/api/cases/${caseA}/analysis-pdf`);
  metrics.analysisPdfMs = Date.now() - tAnalysis;
  const analysisBytes = analysis.ok() ? await analysis.body() : Buffer.alloc(0);
  const analysisIsPdf = analysisBytes.subarray(0, 4).toString() === "%PDF";
  if (analysisIsPdf) writeFileSync(`${SHOTS}/financial-analysis-report.pdf`, analysisBytes);
  record(
    "Financial Intelligence",
    "Financial analysis PDF report downloads",
    "200, valid PDF",
    `${analysis.status()}, ${analysisBytes.length} bytes, %PDF=${analysisIsPdf}, ${metrics.analysisPdfMs}ms`,
    analysis.ok() && analysisIsPdf,
  );

  // Insight Chat (OpenAI) — bank-side Q&A grounded in deterministic output.
  const tChat = Date.now();
  const chat = await page.request.post(`${BASE}/api/cases/${caseA}/chat`, {
    data: { message: "Summarize the main liquidity ratios and what drives the risk score." },
  });
  metrics.chatMs = Date.now() - tChat;
  const chatText = chat.ok() ? await chat.text() : "";
  record(
    "Decision Intelligence",
    "Insight Chat answers a Risk Officer question (OpenAI, streamed)",
    "200 with substantive answer",
    `${chat.status()}, ${chatText.length} chars in ${metrics.chatMs}ms`,
    chat.ok() && chatText.length > 50,
  );

  // Audit trail
  const audits = await prisma.auditLog.count({ where: { caseId: caseA } });
  record(
    "Audit",
    "Case lifecycle is written to the audit trail",
    "> 5 audit entries for the case",
    `${audits} entries`,
    audits > 5,
  );
  await ctx.close();
}

// ════════ 5. Contractor sees the terminal state ════════
{
  const page = contractorCtx.pages()[0]!;
  await page.goto(`${BASE}/cases/${caseA}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/12-contractor-final-issued.png` });
  const bodyText = await page.locator("body").innerText();
  const seesOutcome = /issued|approved/i.test(bodyText);
  record(
    "Contractor",
    "Contractor case page reflects the terminal decision",
    "shows issued/approved outcome",
    seesOutcome ? "outcome visible" : "outcome NOT visible",
    seesOutcome,
  );
  await contractorCtx.close();
}

await browser.close();

const failed = evidence.filter((e) => !e.pass);
console.log(`\n──── E2E SUMMARY: ${evidence.length - failed.length}/${evidence.length} PASS ────`);
console.log(`Console errors captured: ${consoleErrors.length}`);
for (const err of consoleErrors.slice(0, 10)) console.log("  CONSOLE:", err);
writeFileSync(
  `${SCRATCH}/verify-e2e-results.json`,
  JSON.stringify({ evidence, metrics, consoleErrors }, null, 2),
);
await prisma.$disconnect();
process.exit(failed.length ? 1 : 0);
