"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { generateDecisionAction } from "@/app/(app)/review/actions";
import { Button } from "@/components/ui/button";

/**
 * Triggers memo generation. Identical engine output hits the service's
 * response cache, so re-clicking never causes a duplicate provider call.
 */
export function GenerateDecisionButton({
  caseId,
  regenerate = false,
}: {
  caseId: string;
  regenerate?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleGenerate() {
    setPending(true);
    const result = await generateDecisionAction(caseId);
    setPending(false);
    if (result.ok) {
      toast.success("Underwriting analysis is ready");
      router.refresh();
    } else if (result.error) {
      toast.error(result.error);
    }
  }

  return (
    <Button
      variant={regenerate ? "outline" : "default"}
      size={regenerate ? "sm" : "default"}
      onClick={handleGenerate}
      disabled={pending}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Sparkles className="size-4" aria-hidden />
      )}
      {pending ? "Generating…" : regenerate ? "Regenerate" : "Generate Underwriting Analysis"}
    </Button>
  );
}
