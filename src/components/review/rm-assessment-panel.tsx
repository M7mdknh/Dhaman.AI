import { Handshake } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";

export interface MemoRevisionView {
  version: number;
  summary: string;
  relationshipContext: string | null;
  author: string;
  createdAt: string; // ISO
}

/**
 * The Relationship Manager's refinement of the AI draft — what the Risk
 * Officer reads alongside the untouched AI memo. Only the newest revision is
 * shown; the version badge and audit trail carry the full history.
 */
export function RmAssessmentPanel({
  revision,
  revisionCount,
  routedBy,
  routedAt,
}: {
  revision: MemoRevisionView | null;
  revisionCount: number;
  routedBy: string | null;
  routedAt: string | null; // ISO
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Handshake className="size-4 text-muted-foreground" aria-hidden />
            RM Assessment
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            The Relationship Manager&apos;s refinement of the AI draft. The AI original below
            stays untouched.
          </p>
        </div>
        {revision && (
          <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
            Version {revision.version}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {revision ? (
          <>
            <section aria-label="Refined executive summary">
              <h3 className="text-[13px] font-semibold text-foreground">Executive Summary</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                {revision.summary}
              </p>
            </section>
            {revision.relationshipContext && (
              <section
                aria-label="Relationship context"
                className="rounded-lg border border-border bg-muted/40 p-4"
              >
                <h3 className="text-[13px] font-semibold text-foreground">
                  Relationship Context
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                  {revision.relationshipContext}
                </p>
              </section>
            )}
            <p className="border-t border-border pt-3 text-[11px] text-muted-foreground">
              Revised by {revision.author} · {formatDateTime(new Date(revision.createdAt))} ·{" "}
              {revisionCount} version{revisionCount === 1 ? "" : "s"} (all retained)
            </p>
          </>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            Routed without memo edits — the AI draft below stands as submitted.
          </p>
        )}
        {routedAt && (
          <p className="text-[11px] text-muted-foreground">
            Submitted to the Risk Officer by {routedBy ?? "the Relationship Manager"} ·{" "}
            {formatDateTime(new Date(routedAt))}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
