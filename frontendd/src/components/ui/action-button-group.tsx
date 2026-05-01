"use client";

import Link from "next/link";

type ActionButtonTone = "info" | "warning" | "danger";
type ActionButtonIcon = "info" | "user" | "delete";

export interface ActionButtonItem {
  key: string;
  label: string;
  icon: ActionButtonIcon;
  tone: ActionButtonTone;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
}

interface ActionButtonGroupProps {
  actions: ActionButtonItem[];
}

const toneStyles: Record<ActionButtonTone, string> = {
  info: "border-blue-200 text-blue-500 hover:bg-blue-50",
  warning: "border-amber-200 text-amber-500 hover:bg-amber-50",
  danger: "border-rose-200 text-rose-500 hover:bg-rose-50",
};

function ActionIcon({ icon }: { icon: ActionButtonIcon }) {
  if (icon === "user") {
    return (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
        <path d="M10 10.5a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M4.75 16.25a5.25 5.25 0 0 1 10.5 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "delete") {
    return (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
        <path d="M5.75 6.5h8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M8 4.75h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M7 7.25v6.25M10 7.25v6.25M13 7.25v6.25" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M6.25 6.5l.35 8.07A1.5 1.5 0 0 0 8.1 16h3.8a1.5 1.5 0 0 0 1.5-1.43l.35-8.07" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10 8v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="10" cy="5.75" r=".9" fill="currentColor" />
    </svg>
  );
}

function ActionButton({ action }: { action: ActionButtonItem }) {
  const className = `inline-flex h-10 w-10 items-center justify-center rounded-xl border bg-white transition ${toneStyles[action.tone]} ${
    action.disabled ? "cursor-not-allowed opacity-45 hover:bg-white" : ""
  }`;

  if (action.href && !action.disabled) {
    return (
      <Link href={action.href} aria-label={action.label} title={action.label} className={className}>
        <ActionIcon icon={action.icon} />
      </Link>
    );
  }

  return (
    <button
      type="button"
      aria-label={action.label}
      title={action.label}
      className={className}
      onClick={action.onClick}
      disabled={action.disabled}
    >
      <ActionIcon icon={action.icon} />
    </button>
  );
}

export function ActionButtonGroup({ actions }: ActionButtonGroupProps) {
  return (
    <div className="flex items-center gap-2">
      {actions.map((action) => (
        <ActionButton key={action.key} action={action} />
      ))}
    </div>
  );
}