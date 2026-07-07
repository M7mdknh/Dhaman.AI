"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileSearch, Loader2, PlayCircle } from "lucide-react";
import { toast } from "sonner";

import { resumeReviewAction, startReviewAction } from "@/app/(app)/review/actions";
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

/** Confirmed lifecycle action shared by Start Review and Resume Review. */
function LifecycleDialog({
  caseId,
  reference,
  action,
  trigger,
  title,
  description,
  confirmLabel,
  successMessage,
}: {
  caseId: string;
  reference: string;
  action: (caseId: string) => Promise<{ ok: boolean; error?: string }>;
  trigger: React.ReactElement<Record<string, unknown>>;
  title: string;
  description: string;
  confirmLabel: string;
  successMessage: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    setPending(true);
    const result = await action(caseId);
    setPending(false);
    setOpen(false);
    if (result.ok) {
      toast.success(successMessage);
      router.refresh();
    } else if (result.error) {
      toast.error(result.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {reference} — {description}
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
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function StartReviewButton({ caseId, reference }: { caseId: string; reference: string }) {
  return (
    <LifecycleDialog
      caseId={caseId}
      reference={reference}
      action={startReviewAction}
      title="Start review?"
      description="the case moves to Under Review and is assigned to you. Viewing alone never changes case state."
      confirmLabel="Start Review"
      successMessage="Review started"
      trigger={
        <Button className="w-full">
          <PlayCircle className="size-4" aria-hidden />
          Start Review
        </Button>
      }
    />
  );
}

export function ResumeReviewButton({ caseId, reference }: { caseId: string; reference: string }) {
  return (
    <LifecycleDialog
      caseId={caseId}
      reference={reference}
      action={resumeReviewAction}
      title="Resume review?"
      description="confirm the requested information has been received; the case returns to Under Review."
      confirmLabel="Resume Review"
      successMessage="Review resumed"
      trigger={
        <Button variant="outline" className="w-full">
          <FileSearch className="size-4" aria-hidden />
          Resume Review
        </Button>
      }
    />
  );
}
