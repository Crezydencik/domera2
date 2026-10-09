"use client";

import { FiChevronDown } from "react-icons/fi";

type ExpandToggleButtonProps = {
  count: number | string;
  open: boolean;
  onClick: () => void;
  label?: string;
};

export function ExpandToggleButton({ count, open, onClick, label }: ExpandToggleButtonProps) {
  const showCount = String(count) !== "1";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 shadow-sm shadow-slate-950/[0.03] transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200 ${showCount ? "min-w-10 gap-1.5 px-2.5" : "w-8"}`}
      aria-expanded={open}
      aria-label={label}
    >
      {showCount ? <span>{count}</span> : null}
      <FiChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${open ? "rotate-180 text-blue-600" : ""}`} aria-hidden="true" />
    </button>
  );
}
