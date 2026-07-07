/**
 * Internal officer notes (Sprint 5). Bank-internal by definition: no
 * contractor-facing service or query ever includes `CaseNote` rows.
 */
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/services/audit-service";
import { getOfficerUser } from "@/services/officer-case-service";

type ActionResult = { ok: true } | { ok: false; error: string };

const MAX_NOTE_LENGTH = 4_000;

export async function addCaseNote(
  officerUserId: string,
  caseId: string,
  content: string,
): Promise<ActionResult> {
  const officer = await getOfficerUser(officerUserId);
  if (!officer) return { ok: false, error: "Only bank staff can add notes." };

  const trimmed = content.trim();
  if (!trimmed) return { ok: false, error: "A note cannot be empty." };
  if (trimmed.length > MAX_NOTE_LENGTH) {
    return { ok: false, error: `Notes are limited to ${MAX_NOTE_LENGTH} characters.` };
  }

  const underwritingCase = await prisma.underwritingCase.findFirst({
    where: { id: caseId, status: { not: "DRAFT" } },
    select: { id: true },
  });
  if (!underwritingCase) return { ok: false, error: "Case not found." };

  await prisma.caseNote.create({
    data: { caseId, authorId: officerUserId, content: trimmed },
  });
  await recordAudit({
    action: "officer.note_added",
    actorId: officerUserId,
    caseId,
    detail: { length: trimmed.length },
  });
  return { ok: true };
}
