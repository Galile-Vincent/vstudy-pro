"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export interface SuggestionsProps extends Omit<
  ComponentProps<"div">,
  "children"
> {
  suggestions: readonly string[];
  selectedSuggestion: string | null;
  cycle: number;
  onSuggestion: (suggestion: string) => void;
  variant?: "pills" | "list";
}

export function Suggestions({
  suggestions,
  selectedSuggestion,
  cycle,
  onSuggestion,
  variant = "pills",
  className,
  ...props
}: SuggestionsProps) {
  const list = variant === "list";

  return (
    <div
      data-slot="suggestions"
      key={cycle}
      className={cn(
        list
          ? "flex w-full max-w-sm flex-col gap-2"
          : "flex max-w-md flex-wrap justify-center gap-2",
        className,
      )}

      {...props}
    >
      {suggestions.map((suggestion, index) => (
        <button
          key={suggestion}
          type="button"
          aria-pressed={selectedSuggestion === suggestion}
          onClick={() => onSuggestion(suggestion)}
          className={cn(
            "aui-suggestion flex items-center rounded-(--r-pill) border-0 bg-[color-mix(in_oklab,var(--ink)_4%,var(--surface))] px-(--space-3) py-(--space-2) text-(length:--type-base) text-(--ink) hover:bg-[color-mix(in_oklab,var(--ink)_8%,var(--surface))]",
            list
              ? "w-full text-start"
              : "text-center",
            selectedSuggestion === suggestion &&
              "bg-foreground text-background",
          )}
          style={{ animationDelay: `calc(var(--motion-fast) * ${index} / 2)` }}
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}
