import { cn } from "@/lib/utils";

/**
 * Text-only wordmark: the display serif with a primary-colored full stop.
 * The period is the brand mark — a quiet nod to finality ("the Risk Officer
 * decides."). No icon.
 */
export function Logo({
  className,
  inverse = false,
}: {
  className?: string;
  /** Light-on-dark variant for the deep-emerald brand surfaces. */
  inverse?: boolean;
}) {
  return (
    <span
      className={cn(
        "font-display text-2xl font-normal leading-none tracking-tight",
        inverse ? "text-white" : "text-foreground",
        className,
      )}
    >
      Daman
      <span className={inverse ? "text-emerald-300" : "text-primary"}>.</span>
    </span>
  );
}
