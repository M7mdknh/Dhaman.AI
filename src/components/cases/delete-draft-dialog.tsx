"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteDraftAction } from "@/app/(app)/cases/actions";
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

export function DeleteDraftDialog({ caseId, reference }: { caseId: string; reference: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteDraftAction(caseId);
    if (result.ok) {
      toast.success(`Draft ${reference} deleted`);
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
          <Button variant="destructive">
            <Trash2 className="size-4" aria-hidden />
            Delete Draft
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete draft {reference}?</DialogTitle>
          <DialogDescription>
            The draft and its uploaded financial statements will be permanently removed. This
            cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Cancel</Button>} />
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Delete Draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
