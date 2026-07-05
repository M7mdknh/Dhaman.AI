"use client";

import { useState } from "react";
import { Loader2, SendHorizonal } from "lucide-react";

import {
  CompanySummary,
  ContractSummary,
  DocumentsSummary,
} from "@/components/cases/summary-sections";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import type { DocumentView } from "@/lib/case-view";
import type { CompanyInfoInput, ContractDetailsInput } from "@/lib/validation/case";
import type { CaseActionState } from "@/app/(app)/cases/actions";

interface ReviewStepProps {
  company: CompanyInfoInput;
  contract: ContractDetailsInput | null;
  documents: DocumentView[];
  onEdit: (step: number) => void;
  onSubmit: () => Promise<CaseActionState>;
}

function SectionCard({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardAction>
          <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
            Edit
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function ReviewStep({ company, contract, documents, onEdit, onSubmit }: ReviewStepProps) {
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const canSubmit = contract !== null && documents.length > 0;

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await onSubmit(); // errors are toasted by the wizard
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Review & Submit</CardTitle>
          <CardDescription>
            Check everything below. After submission the case becomes read-only and moves to the
            bank for underwriting.
          </CardDescription>
        </CardHeader>
      </Card>

      <SectionCard title="Company Information" onEdit={() => onEdit(1)}>
        <CompanySummary company={company} />
      </SectionCard>

      <SectionCard title="Contract Details" onEdit={() => onEdit(2)}>
        {contract ? (
          <ContractSummary contract={contract} />
        ) : (
          <p className="text-sm text-muted-foreground">Contract details are not completed yet.</p>
        )}
      </SectionCard>

      <SectionCard title="Financial Statements" onEdit={() => onEdit(3)}>
        <DocumentsSummary documents={documents} />
      </SectionCard>

      {!canSubmit && (
        <Alert>
          <AlertTitle>Not ready to submit</AlertTitle>
          <AlertDescription>
            {contract
              ? "Upload at least one audited financial statement before submitting."
              : "Complete the contract details before submitting."}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" onClick={() => onEdit(3)}>
          Back
        </Button>
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogTrigger
            render={
              <Button type="button" disabled={!canSubmit || submitting}>
                <SendHorizonal className="size-4" aria-hidden />
                Submit Case
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Submit this underwriting case?</DialogTitle>
              <DialogDescription>
                The case will be sent to the bank for underwriting and can no longer be edited.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="outline">Cancel</Button>} />
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
                Confirm & Submit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
