"use client";

import { forwardRef, useState } from "react";
import type { ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  labelClassName?: string;
  leftIcon?: ReactNode;
  /** Renders a show/hide toggle; use instead of type="password". */
  showToggle?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      hint,
      labelClassName = "",
      leftIcon,
      showToggle,
      type,
      className = "",
      id,
      ...props
    },
    ref,
  ) => {
    const [show, setShow] = useState(false);
    const resolvedType = showToggle ? (show ? "text" : "password") : type;
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

    const baseClasses =
      "w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm shadow-slate-950/[0.02] placeholder:text-slate-400 outline-none transition focus:ring-2";
    const stateClasses = error
      ? "border-red-400 focus:border-red-400 focus:ring-red-100"
      : "border-slate-300 focus:border-slate-500 focus:ring-slate-200";
    const paddingLeft = leftIcon ? "pl-10" : "";
    const paddingRight = showToggle ? "pr-10" : "";

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className={["text-sm font-medium text-slate-700", labelClassName].join(" ")}>
            {label}
          </label>
        )}

        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={resolvedType}
            className={[baseClasses, stateClasses, paddingLeft, paddingRight, className].join(" ")}
            {...props}
          />

          {leftIcon && (
            <span className="pointer-events-none absolute left-3 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-slate-400">
              {leftIcon}
            </span>
          )}

          {showToggle && (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShow((value) => !value)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
              aria-label={show ? "Hide password" : "Show password"}
            >
              {show ? (
                <EyeOff className="h-4 w-4" aria-hidden />
              ) : (
                <Eye className="h-4 w-4" aria-hidden />
              )}
            </button>
          )}
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}
        {hint && !error && <p className="text-xs leading-5 text-slate-500">{hint}</p>}
      </div>
    );
  },
);

Input.displayName = "Input";
