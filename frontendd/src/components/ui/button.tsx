"use client";

import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "ghost"
  | "approve"
  | "dark"
  | "outlineDark"
  | "inlineLink"
  | "plain";
type ButtonSize = "sm" | "md" | "lg" | "pill" | "link" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "border-transparent bg-slate-950 text-white shadow-sm hover:bg-slate-800 active:bg-slate-900",
  secondary:
    "border-slate-300 bg-white text-slate-700 shadow-sm hover:border-slate-400 hover:bg-slate-50 active:bg-slate-100",
  danger:
    "border-transparent bg-rose-600 text-white shadow-sm hover:bg-rose-700 active:bg-rose-800",
  ghost:
    "border-transparent bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-950 active:bg-slate-200",
  approve:
    "border-transparent bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 active:bg-emerald-800",
  dark:
    "border-transparent bg-slate-950 text-white shadow-sm hover:bg-slate-800 active:bg-slate-900",
  outlineDark:
    "border-slate-950 bg-white text-slate-950 shadow-sm hover:bg-slate-100 active:bg-slate-200",
  inlineLink:
    "rounded-none border-0 border-b border-slate-950 bg-transparent text-slate-950 shadow-none hover:text-slate-700 active:text-slate-900",
  plain:
    "border-transparent bg-transparent text-slate-950 shadow-none hover:bg-transparent active:bg-transparent",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "min-h-8 rounded-lg px-3 py-1.5 text-xs gap-1.5",
  md: "min-h-10 rounded-lg px-4 py-2 text-sm gap-2",
  lg: "min-h-11 rounded-lg px-5 py-2.5 text-base gap-2.5",
  pill: "px-6 py-3 text-base rounded-full gap-2",
  link: "p-0 text-base rounded-none gap-0",
  icon: "p-0 text-base rounded-none gap-0",
};

function getButtonClassName({
  variant,
  size,
  className = "",
}: {
  variant: ButtonVariant;
  size: ButtonSize;
  className?: string;
}) {
  return `inline-flex touch-manipulation select-none items-center justify-center whitespace-nowrap border font-medium transition duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-50 ${variantStyles[variant]} ${sizeStyles[size]} ${className}`;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={getButtonClassName({ variant, size, className })}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className = "",
  children,
  href,
  ...props
}: ButtonLinkProps) {
  return (
    <Link href={href} className={getButtonClassName({ variant, size, className })} {...props}>
      {children}
    </Link>
  );
}
