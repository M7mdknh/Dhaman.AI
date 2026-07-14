import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, BarChart3 } from "lucide-react";

import { FinancialIntelligencePanel } from "@/components/analysis/financial-intelligence-panel";
import { StatusBadge } from "@/components/cases/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { getOwnedCase } from "@/services/case-service";
import {
  buildFinancialIntelligence,
  toIdentityInputs,
} from "@/services/finance/financial-intelligence-service";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Financial Analysis" };

export default async function FinancialAnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const underwritingCase = await getOwnedCase(session.userId, id);
  if (!underwritingCase) notFound();

  const report = buildFinancialIntelligence(
    underwritingCase.financialStatements,
    underwritingCase.contractDetails,
    toIdentityInputs(underwritingCase.company.name, underwritingCase.documents),
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/cases/${id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          {underwritingCase.reference}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Financial Intelligence
          </h1>
          <StatusBadge status={underwritingCase.status} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Deterministic analysis computed from the parsed IFRS statements — no
          AI involved in any figure on this page.
        </p>
      </div>

      {report === null ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <BarChart3 className="size-5" aria-hidden />
            </span>
            <h2 className="mt-4 text-sm font-semibold text-foreground">No analysis available yet</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Financial intelligence is generated once the case is submitted and
              its IFRS statements are parsed.
            </p>
          </CardContent>
        </Card>
      ) : (
        <FinancialIntelligencePanel report={report} />
      )}
    </div>
  );
}
