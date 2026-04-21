"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "approve";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 border-transparent shadow-lg shadow-blue-600/20",
  secondary:
    "bg-transparent text-blue-500 border-blue-500 hover:bg-blue-500/10 active:bg-blue-500/20",
  danger:
    "bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800 border-transparent shadow-lg shadow-rose-600/20",
  ghost:
    "bg-transparent text-slate-300 border-transparent hover:bg-white/10 active:bg-white/15",
  approve:
    "bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 border-transparent shadow-lg shadow-emerald-600/20",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs rounded-lg gap-1.5",
  md: "px-5 py-2.5 text-sm rounded-xl gap-2",
  lg: "px-7 py-3 text-base rounded-2xl gap-2.5",
};

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
      className={`inline-flex items-center justify-center border font-medium transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:pointer-events-none disabled:opacity-50 ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
