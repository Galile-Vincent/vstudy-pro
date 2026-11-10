"use client";
import { type ComponentPropsWithRef, forwardRef } from "react";
import { Button, Tooltip } from "@astryxdesign/core";
import { cn } from "@/lib/utils";

export type TooltipIconButtonProps = Omit<ComponentPropsWithRef<typeof Button>, "label" | "size"> & {
  tooltip: string;
  side?: "top" | "bottom" | "left" | "right";
  size?: "icon" | "sm" | "md" | "lg";
  disabled?: boolean;
};

export const TooltipIconButton = forwardRef<HTMLButtonElement, TooltipIconButtonProps>(
  ({ children, tooltip, side = "bottom", className, size, disabled, isDisabled, ...rest }, ref) => (
    <Tooltip content={tooltip} delay={0} placement={side === "top" ? "above" : side === "bottom" ? "below" : side === "left" ? "start" : "end"}>
      <Button {...rest} label={tooltip} variant={rest.variant ?? "ghost"} size={size === "icon" ? "md" : (size ?? "md")} isDisabled={!!(disabled || isDisabled)} className={cn("aui-button-icon", className)} ref={ref} icon={children} isIconOnly/>
    </Tooltip>
  ),
);
TooltipIconButton.displayName = "TooltipIconButton";
