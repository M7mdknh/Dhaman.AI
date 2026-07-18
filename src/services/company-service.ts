/**
 * Company profile business logic (wizard Step 1).
 *
 * A contractor user may register before their company exists in Dhaman, so
 * the first save creates the Company and links the user to it. Subsequent
 * saves update the same company.
 */
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/services/audit-service";

import type { CompanyInfoInput } from "@/lib/validation/case";
import type { Company } from "@/generated/prisma/client";

export function getCompanyForUser(userId: string): Promise<Company | null> {
  return prisma.company
    .findFirst({ where: { users: { some: { id: userId } } } });
}

export async function upsertCompanyForUser(
  userId: string,
  input: CompanyInfoInput,
): Promise<{ ok: true; company: Company } | { ok: false; error: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== "CONTRACTOR") {
    return { ok: false, error: "Only contractors can manage a company profile." };
  }

  // The CR number is nationally unique — one row per real company. A second
  // teammate at the same company will naturally enter the same CR number;
  // rather than hard-rejecting them (there is no other way to add a second
  // user to a company today), join them to the existing row instead of
  // creating a duplicate. A genuine conflict — this user already belongs to
  // a DIFFERENT company than the one that owns this CR number — still fails.
  const crOwner = await prisma.company.findUnique({ where: { crNumber: input.crNumber } });
  if (crOwner && crOwner.id !== user.companyId) {
    if (user.companyId) {
      return {
        ok: false,
        error:
          "This Commercial Registration number is already registered to a different company " +
          "than the one on your account. Contact your bank administrator if this is a genuine change.",
      };
    }
    // Join: link this user to the existing company. Its established fields
    // are never overwritten by a second user's form submission — only the
    // first registration (or an already-linked user's edit) can change them.
    await prisma.user.update({ where: { id: userId }, data: { companyId: crOwner.id } });
    await recordAudit({
      action: "company.user_joined",
      actorId: userId,
      detail: { companyId: crOwner.id },
    });
    return { ok: true, company: crOwner };
  }

  if (user.companyId) {
    // Company IDENTITY (legal name + CR number) is frozen once any case has
    // been submitted under it: submitted cases, memos, and decisions all
    // reference this row, and renaming it would silently relabel the bank's
    // historical underwriting records. Contact/profile fields stay editable.
    const existing = await prisma.company.findUnique({ where: { id: user.companyId } });
    const identityChanged =
      existing && (existing.name !== input.name || existing.crNumber !== input.crNumber);
    if (identityChanged) {
      const submittedCases = await prisma.underwritingCase.count({
        where: { companyId: user.companyId, status: { not: "DRAFT" } },
      });
      if (submittedCases > 0) {
        return {
          ok: false,
          error:
            `The company name and CR number are locked because ${submittedCases} submitted ` +
            `case${submittedCases === 1 ? " references" : "s reference"} this company. ` +
            "Underwriting records must keep the identity they were decided under — " +
            "ask your bank administrator to correct a genuine registration change.",
        };
      }
    }

    const company = await prisma.company.update({
      where: { id: user.companyId },
      data: input,
    });
    await recordAudit({
      action: "company.profile_updated",
      actorId: userId,
      detail: { companyId: company.id },
    });
    return { ok: true, company };
  }

  const company = await prisma.$transaction(async (tx) => {
    const created = await tx.company.create({ data: input });
    await tx.user.update({ where: { id: userId }, data: { companyId: created.id } });
    return created;
  });
  await recordAudit({
    action: "company.created",
    actorId: userId,
    detail: { companyId: company.id },
  });
  return { ok: true, company };
}
