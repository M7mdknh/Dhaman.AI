"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileCheck2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { issueGuaranteeAction } from "@/app/(app)/review/actions";
import { Button } from "@/components/ui/button";
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

export function IssueGuaranteeButton({
  caseId,
  reference,
  amountLabel,
}: {
  caseId: string;
  reference: string;
  amountLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    setPending(true);
    const result = await issueGuaranteeAction(caseId);
    setPending(false);
    setOpen(false);
    if (result.ok) {
      toast.success("Letter of Guarantee issued");
      router.refresh();
    } else if (result.error) {
      toast.error(result.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button className="w-full">
            <FileCheck2 className="size-4" aria-hidden />
            Issue Letter of Guarantee
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Issue Letter of Guarantee?</DialogTitle>
          <DialogDescription>
            {reference} — a guarantee for {amountLabel} will be issued with a unique LG
            reference and the case becomes Issued. This is recorded in the audit trail and
            cannot be undone here.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose
            render={
              <Button variant="outline" disabled={pending}>
                Cancel
              </Button>
            }
          />
          <Button onClick={handleConfirm} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Issue Guarantee
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
