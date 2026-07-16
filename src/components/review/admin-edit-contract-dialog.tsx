"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PencilLine } from "lucide-react";
import { toast } from "sonner";

import { adminEditCaseAction } from "@/app/(app)/review/actions";
import { ContractStep } from "@/components/cases/wizard/contract-step";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import type { ContractDetailsInput } from "@/lib/validation/case";

/**
 * Administrator override: edits a case's contract details regardless of
 * status. Reuses the contractor's own ContractStep form verbatim — same
 * validation, same guarantee-ratio behavior — inside a dialog instead of
 * the wizard, since a submitted case is never re-entered through /cases/new.
 */
export function AdminEditContractDialog({
  caseId,
  reference,
  defaults,
}: {
  caseId: string;
  reference: string;
  defaults: ContractDetailsInput;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function handleSave(values: ContractDetailsInput) {
    const result = await adminEditCaseAction(caseId, values);
    if (result.ok) {
      toast.success(`${reference} updated`);
      setOpen(false);
      router.refresh();
    } else if (result.error) {
      toast.error(result.error);
    }
    return result;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <PencilLine className="size-3.5" aria-hidden />
            Edit Case
          </Button>
        }
      />
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {reference}</DialogTitle>
          <DialogDescription>
            Administrator override — this bypasses the normal lock on submitted cases. Every
            change is recorded in the audit trail.
          </DialogDescription>
        </DialogHeader>
        {/* caseId null: the contract-document upload belongs to the
            contractor's draft flow, not the admin correction dialog. */}
        <ContractStep
          caseId={null}
          defaults={defaults}
          contractDocument={null}
          onContractDocumentChange={() => {}}
          onBack={() => setOpen(false)}
          onSave={handleSave}
        />
      </DialogContent>
    </Dialog>
  );
}
