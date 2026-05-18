import * as React from "react";

import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
};

const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-[linear-gradient(135deg,_#0f172a_0%,_#1e3a8a_100%)] text-white shadow-soft hover:brightness-110 focus-visible:outline-slate-950",
  secondary:
    "border border-line bg-white text-ink hover:border-brand-200 hover:bg-slate-50 focus-visible:outline-brand-500",
  ghost:
    "bg-transparent text-slate-600 hover:bg-slate-100 focus-visible:outline-brand-500",
  danger:
    "bg-rose-600 text-white shadow-soft hover:bg-rose-700 focus-visible:outline-rose-600",
  success:
    "bg-emerald-600 text-white shadow-soft hover:bg-emerald-700 focus-visible:outline-emerald-600"
} as const;

export function buttonVariants(variant: NonNullable<ButtonProps["variant"]> = "primary") {
  return cn(
    "inline-flex h-11 items-center justify-center rounded-2xl px-5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50",
    variants[variant]
  );
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants(variant), className)}
      {...props}
    />
  )
);

Button.displayName = "Button";
