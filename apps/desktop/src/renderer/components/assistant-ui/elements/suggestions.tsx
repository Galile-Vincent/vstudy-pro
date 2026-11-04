"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export interface SuggestionsProps extends Omit<
  ComponentProps<"div">,
  "children"
> {
  suggestions: readonly (string | { id: string; label: string })[];
  selectedSuggestion?: string | null;
  disabled?: boolean;
  cycle: number;
  onSuggestion: (suggestion: string) => void;
  variant?: "pills" | "list";
}

export function Suggestions({
  suggestions,
  selectedSuggestion,
  cycle,
  disabled,
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
      {suggestions.map((item) => {
        const suggestion = typeof item === "string" ? { id: item, label: item } : item;
        return (
          <button
            key={suggestion.id}
            type="button"
            aria-pressed={selectedSuggestion === undefined ? undefined : selectedSuggestion === suggestion.id}
            disabled={disabled}
            onClick={() => onSuggestion(suggestion.id)}
            className={cn(
              "aui-suggestion flex items-center rounded-(--r-pill) border-0 px-(--space-3) py-(--space-2) text-(length:--type-base) text-(--ink)",
              list
                ? "w-full text-start"
                : "text-center",
            )}
          >
            {suggestion.label}
          </button>
        );
      })}
    </div>
  );
}
