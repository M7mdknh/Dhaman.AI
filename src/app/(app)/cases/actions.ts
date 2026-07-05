"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { companyInfoSchema, contractDetailsSchema } from "@/lib/validation/case";
import { createDraftCase, deleteDraftCase, saveContractDetails, submitCase } from "@/services/case-service";
import { upsertCompanyForUser } from "@/services/company-service";
import { removeFinancialStatement } from "@/services/document-service";

export interface CaseActionState {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  caseId?: string;
}

async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

function revalidateCase(caseId: string) {
  revalidatePath("/dashboard");
  revalidatePath(`/cases/${caseId}`);
  revalidatePath(`/cases/${caseId}/edit`);
}

/** Step 1 on /cases/new: saves the company profile AND creates the draft case. */
export async function startCaseAction(values: unknown): Promise<CaseActionState> {
  const session = await requireSession();
  const parsed = companyInfoSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const company = await upsertCompanyForUser(session.userId, parsed.data);
  if (!company.ok) return { ok: false, error: company.error };

  const created = await createDraftCase(session.userId);
  if (!created.ok) return { ok: false, error: created.error };

  revalidatePath("/dashboard");
  return { ok: true, caseId: created.data.caseId };
}

/** Step 1 on an existing draft: updates the company profile only. */
export async function saveCompanyAction(caseId: string, values: unknown): Promise<CaseActionState> {
  const session = await requireSession();
  const parsed = companyInfoSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const result = await upsertCompanyForUser(session.userId, parsed.data);
  if (!result.ok) return { ok: false, error: result.error };

  revalidateCase(caseId);
  return { ok: true };
}

/** Step 2: persists contract details on a draft. */
export async function saveContractAction(caseId: string, values: unknown): Promise<CaseActionState> {
  const session = await requireSession();
  const parsed = contractDetailsSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const result = await saveContractDetails(session.userId, caseId, parsed.data);
  if (!result.ok) return { ok: false, error: result.error };

  revalidateCase(caseId);
  return { ok: true };
}

/** Step 3: removes an uploaded statement (uploads go through the API route). */
export async function removeDocumentAction(
  caseId: string,
  documentId: string,
): Promise<CaseActionState> {
  const session = await requireSession();
  const result = await removeFinancialStatement(session.userId, documentId);
  if (!result.ok) return { ok: false, error: result.error };

  revalidateCase(caseId);
  return { ok: true };
}

/** Step 4: DRAFT → SUBMITTED. */
export async function submitCaseAction(caseId: string): Promise<CaseActionState> {
  const session = await requireSession();
  const result = await submitCase(session.userId, caseId);
  if (!result.ok) return { ok: false, error: result.error };

  revalidateCase(caseId);
  return { ok: true };
}

export async function deleteDraftAction(caseId: string): Promise<CaseActionState> {
  const session = await requireSession();
  const result = await deleteDraftCase(session.userId, caseId);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/dashboard");
  return { ok: true };
}
