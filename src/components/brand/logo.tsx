import { ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <ShieldCheck className="size-4.5" aria-hidden />
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-foreground">
        Daman
      </span>
    </span>
  );
}
