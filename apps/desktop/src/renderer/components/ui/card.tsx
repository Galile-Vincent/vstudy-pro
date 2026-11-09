import { cva } from "class-variance-authority"
import "./ui.css"
import * as React from "react"
import { cn } from "@/lib/utils"

export type CardProps =
  | (React.ComponentProps<"div"> & { variant?: "flat" | "raised" })
  | (React.ComponentProps<"button"> & { variant: "interactive"; href?: never })
  | (React.ComponentProps<"a"> & { variant: "interactive"; href: string; disabled?: boolean })

function Card(props: CardProps) {
  if (props.variant === "interactive" && props.href !== undefined) {
    const { variant, className, disabled, href, onClick, ...rest } = props
    return <a {...rest} data-slot="card" data-variant={variant} className={cn(cardVariants({ variant }), className)} href={disabled ? undefined : href} aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : rest.tabIndex} onClick={disabled ? undefined : onClick} />
  }
  if (props.variant === "interactive") {
    const { variant, className, ...rest } = props
    return <button type="button" {...rest} data-slot="card" data-variant={variant} className={cn(cardVariants({ variant }), className)} />
  }
  const { className, variant = "raised", ...rest } = props
  return <div {...rest} data-slot="card" data-variant={variant} className={cn(cardVariants({ variant }), className)} />
}

const cardVariants = cva(
  "flex flex-col gap-[var(--space-6)] rounded-[var(--r-lg)] bg-[color-mix(in_oklab,var(--ink)_4%,var(--surface))] py-[var(--space-6)] text-card-foreground",
  { variants: { variant: { flat: "", raised: "", interactive: "text-start cursor-pointer disabled:opacity-[var(--opacity-disabled)]" } }, defaultVariants: { variant: "raised" } }
)

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
