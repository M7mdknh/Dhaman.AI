"use server";

/**
 * Officer workspace server actions (Sprint 5). Thin by rule: validate the
 * shape with zod, call the service, revalidate. Role and state checks live
 * in the services, never here.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getSession } from "@/lib/auth/session";
import { contractDetailsSchema } from "@/lib/validation/case";
import { adminDeleteCase, adminUpdateContractDetails } from "@/services/admin-case-service";
import { generateDecisionIntelligence } from "@/services/decision/decision-intelligence-service";
import { issueGuarantee } from "@/services/guarantee-service";
import { addCaseNote } from "@/services/note-service";
import { recordDecision, resumeReview, startReview } from "@/services/review-service";
import { saveMemoRevision, submitToRiskOfficer } from "@/services/rm-review-service";

export interface ReviewActionState {
  ok: boolean;
  error?: string;
}

const decisionSchema = z
  .object({
    decision: z.enum(["APPROVE", "APPROVE_WITH_CONDITIONS", "REJECT", "REQUEST_INFO"]),
    reason: z.string().trim().min(1, "A reason is required.").max(4_000),
    conditions: z.string().trim().max(4_000).optional(),
  })
  .refine((input) => input.decision !== "APPROVE_WITH_CONDITIONS" || !!input.conditions, {
    message: "Conditions are required when approving with conditions.",
    path: ["conditions"],
  });

async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

function revalidateReview(caseId: string) {
  revalidatePath("/dashboard");
  revalidatePath(`/review/${caseId}`);
  // Officer/RM actions change status fields (e.g. INFO_REQUESTED) that the
  // contractor's own case page and list render — without this, a contractor
  // with the page already open keeps seeing the stale prior status.
  revalidatePath("/cases");
  revalidatePath(`/cases/${caseId}`);
}

export async function startReviewAction(caseId: string): Promise<ReviewActionState> {
  const session = await requireSession();
  const result = await startReview(session.userId, caseId);
  if (!result.ok) return result;
  revalidateReview(caseId);
  return { ok: true };
}

export async function resumeReviewAction(caseId: string): Promise<ReviewActionState> {
  const session = await requireSession();
  const result = await resumeReview(session.userId, caseId);
  if (!result.ok) return result;
  revalidateReview(caseId);
  return { ok: true };
}

export async function decideAction(
  caseId: string,
  input: { decision: string; reason: string; conditions?: string },
): Promise<ReviewActionState> {
  const session = await requireSession();
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid decision." };
  }
  const result = await recordDecision(session.userId, caseId, parsed.data);
  if (!result.ok) return result;
  revalidateReview(caseId);
  return { ok: true };
}

const memoRevisionSchema = z.object({
  summary: z.string().trim().min(1, "The executive summary cannot be empty.").max(4_000),
  relationshipContext: z.string().trim().max(4_000).optional(),
});

/** RM stage: saves a version-tracked refinement of the AI-drafted memo. */
export async function saveMemoRevisionAction(
  caseId: string,
  input: { summary: string; relationshipContext?: string },
): Promise<ReviewActionState> {
  const session = await requireSession();
  const parsed = memoRevisionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid revision." };
  }
  const result = await saveMemoRevision(session.userId, caseId, parsed.data);
  if (!result.ok) return result;
  revalidateReview(caseId);
  return { ok: true };
}

/** RM stage: routes the reviewed package to the Risk Officer, together with
 * the RM's suggested decision (a recommendation — never binding). */
export async function submitToRiskOfficerAction(
  caseId: string,
  input: { decision: string; reason: string; conditions?: string },
): Promise<ReviewActionState> {
  const session = await requireSession();
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid suggested decision." };
  }
  const result = await submitToRiskOfficer(session.userId, caseId, parsed.data);
  if (!result.ok) return result;
  revalidateReview(caseId);
  return { ok: true };
}

export async function addNoteAction(caseId: string, content: string): Promise<ReviewActionState> {
  const session = await requireSession();
  const result = await addCaseNote(session.userId, caseId, content);
  if (!result.ok) return result;
  revalidatePath(`/review/${caseId}`);
  return { ok: true };
}

export async function issueGuaranteeAction(caseId: string): Promise<ReviewActionState> {
  const session = await requireSession();
  const result = await issueGuarantee(session.userId, caseId);
  if (!result.ok) return { ok: false, error: result.error };
  revalidateReview(caseId);
  return { ok: true };
}

/** Generates (or reuses the cached) AI underwriting memo — bank staff only. */
export async function generateDecisionAction(caseId: string): Promise<ReviewActionState> {
  const session = await requireSession();
  const result = await generateDecisionIntelligence(session.userId, caseId);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath(`/review/${caseId}`);
  revalidatePath(`/cases/${caseId}/package`);
  return { ok: true };
}

/** Admin-only: overwrites a case's contract details regardless of status. */
export async function adminEditCaseAction(
  caseId: string,
  values: unknown,
): Promise<ReviewActionState & { fieldErrors?: Record<string, string[]> }> {
  const session = await requireSession();
  const parsed = contractDetailsSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const result = await adminUpdateContractDetails(session.userId, caseId, parsed.data);
  if (!result.ok) return result;
  revalidateReview(caseId);
  return { ok: true };
}

/** Admin-only: deletes a case outright (any status except one with an issued guarantee). */
export async function adminDeleteCaseAction(caseId: string): Promise<ReviewActionState> {
  const session = await requireSession();
  const result = await adminDeleteCase(session.userId, caseId);
  if (!result.ok) return result;
  revalidatePath("/dashboard");
  revalidatePath("/cases");
  return { ok: true };
}
