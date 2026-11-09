import * as React from "react"
import { cn } from "@/lib/utils"
import { Progress as ProgressPrimitive } from "radix-ui"

function Progress({
  className,
  value,
  max = 100,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const limit = Number.isFinite(max) && max > 0 ? max : 100
  const ratio = typeof value === "number" && Number.isFinite(value)
    ? Math.min(100, Math.max(0, value / limit * 100)) : 0
  return (
    <ProgressPrimitive.Root
      value={value}
      max={limit}
      data-slot="progress"
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-primary/20",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="h-full w-full flex-1 bg-primary transition-all"
        style={{ transform: `translateX(-${100 - ratio}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
