"use client";

import React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

export type ConfirmVariant = "danger" | "primary" | "warning";

export interface ConfirmDialogOptions {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
}

interface ConfirmContextValue {
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
}

const ConfirmContext = React.createContext<ConfirmContextValue | null>(null);

interface State extends ConfirmDialogOptions {
  open: boolean;
  resolver?: (value: boolean) => void;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<State>({
    open: false,
    title: "",
    message: "",
  });

  const close = React.useCallback((value: boolean) => {
    setState((prev) => {
      prev.resolver?.(value);
      return { ...prev, open: false, resolver: undefined };
    });
  }, []);

  const confirm = React.useCallback(
    (options: ConfirmDialogOptions) =>
      new Promise<boolean>((resolve) => {
        setState({ ...options, open: true, resolver: resolve });
      }),
    [],
  );

  const variant = state.variant ?? "danger";
  const iconWrap =
    variant === "danger"
      ? "bg-rose-50 text-rose-600"
      : variant === "warning"
      ? "bg-amber-50 text-amber-600"
      : "bg-blue-50 text-blue-600";
  const confirmBtnClass =
    variant === "danger"
      ? "bg-rose-600 hover:bg-rose-700 text-white"
      : variant === "warning"
      ? "bg-amber-500 hover:bg-amber-600 text-white"
      : "";

  const value = React.useMemo<ConfirmContextValue>(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Modal
        open={state.open}
        onClose={() => close(false)}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => close(false)}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {state.cancelLabel ?? "Отмена"}
            </button>
            {variant === "primary" ? (
              <Button variant="primary" onClick={() => close(true)}>
                {state.confirmLabel ?? "Подтвердить"}
              </Button>
            ) : (
              <button
                type="button"
                onClick={() => close(true)}
                className={`inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium shadow-sm ${confirmBtnClass}`}
              >
                {state.confirmLabel ?? (variant === "danger" ? "Удалить" : "Подтвердить")}
              </button>
            )}
          </div>
        }
      >
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconWrap}`}>
            {variant === "danger" ? (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
              </svg>
            ) : variant === "warning" ? (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
              </svg>
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
            )}
          </div>
          <div className="flex-1 pt-0.5">
            <h3 className="text-base font-semibold text-slate-900">{state.title}</h3>
            <div className="mt-1 text-sm text-slate-600">{state.message}</div>
          </div>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within ConfirmProvider");
  }
  return ctx.confirm;
}
