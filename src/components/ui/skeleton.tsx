import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        // Shimmer sweep on top of the pulse (motion-safe only) — reads as
        // "loading" without drawing attention to itself.
        "relative animate-pulse overflow-hidden rounded-md bg-muted",
        "motion-safe:after:absolute motion-safe:after:inset-0 motion-safe:after:animate-[shimmer-x_1.8s_ease-in-out_infinite] motion-safe:after:bg-linear-to-r motion-safe:after:from-transparent motion-safe:after:via-foreground/4 motion-safe:after:to-transparent",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
