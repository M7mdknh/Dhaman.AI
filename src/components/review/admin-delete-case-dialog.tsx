"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { adminDeleteCaseAction } from "@/app/(app)/review/actions";
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

export function AdminDeleteCaseDialog({ caseId, reference }: { caseId: string; reference: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    const result = await adminDeleteCaseAction(caseId);
    if (result.ok) {
      toast.success(`${reference} deleted`);
      router.push("/dashboard");
    } else {
      setDeleting(false);
      setOpen(false);
      if (result.error) toast.error(result.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="destructive" size="sm">
            <Trash2 className="size-3.5" aria-hidden />
            Delete Case
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {reference}?</DialogTitle>
          <DialogDescription>
            The case, its contract details, documents, financial statements, memos, decisions,
            and notes are permanently removed. This cannot be undone, and is refused if a Letter
            of Guarantee has already been issued.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Cancel</Button>} />
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Delete Case
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
