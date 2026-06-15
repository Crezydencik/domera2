"use client";

import type { ReactNode } from "react";

type ModalShellSize = "md" | "xl";

const sizeClass: Record<ModalShellSize, string> = {
  md: "max-w-lg",
  xl: "max-w-6xl",
};

export function ModalShell({
  open,
  title,
  description,
  children,
  onClose,
  size = "md",
}: {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  size?: ModalShellSize;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex min-h-full items-center justify-center">
        <div
          role="dialog"
          aria-modal="true"
          className={`relative flex max-h-[calc(100vh-2rem)] w-full ${sizeClass[size]} flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl`}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            ×
          </button>
          <div className="mb-4 shrink-0 pr-8">
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
            {description ? <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p> : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">{children}</div>
        </div>
      </div>
    </div>
  );
}
