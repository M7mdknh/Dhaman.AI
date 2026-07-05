import { redirect } from "next/navigation";

import { CaseWizard } from "@/components/cases/wizard/case-wizard";
import { getSession } from "@/lib/auth/session";
import { toCompanyInput } from "@/lib/case-view";
import { getCompanyForUser } from "@/services/company-service";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "New Underwriting Case" };

export default async function NewCasePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "CONTRACTOR") redirect("/dashboard");

  const company = await getCompanyForUser(session.userId);
  const defaults = toCompanyInput(company);
  // Sensible defaults for first-time contractors: they are the contact.
  if (!defaults.contactPerson) defaults.contactPerson = session.fullName;
  if (!defaults.contactEmail) defaults.contactEmail = session.email;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          New Underwriting Case
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Request a Letter of Guarantee in four steps. Your progress is saved as a draft.
        </p>
      </div>
      <CaseWizard mode="new" company={defaults} contract={null} documents={[]} />
    </div>
  );
}
