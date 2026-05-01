"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type AlertVariant = "info" | "success" | "warning" | "error";

interface AlertModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  variant?: AlertVariant;
  confirmLabel?: string;
  cancelLabel?: string;
  approveLabel?: string;
  onConfirm?: () => void;
  onApprove?: () => void;
}

const iconMap: Record<AlertVariant, { icon: string; color: string }> = {
  info:    { icon: "ℹ", color: "bg-blue-50 text-blue-600 border-blue-200" },
  success: { icon: "✓", color: "bg-emerald-50 text-emerald-600 border-emerald-200" },
  warning: { icon: "⚠", color: "bg-amber-50 text-amber-600 border-amber-200" },
  error:   { icon: "✕", color: "bg-rose-50 text-rose-600 border-rose-200" },
};

export function AlertModal({
  open,
  onClose,
  title,
  children,
  variant = "info",
  confirmLabel,
  cancelLabel,
  approveLabel,
  onConfirm,
  onApprove,
}: AlertModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;

    if (open && !el.open) {
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;

    const handleClose = () => onClose();
    el.addEventListener("close", handleClose);
    return () => el.removeEventListener("close", handleClose);
  }, [onClose]);

  const { icon, color } = iconMap[variant];

  return (
    <dialog
      ref={dialogRef}
      className="m-auto max-w-md rounded-3xl border border-slate-200 bg-white p-0 shadow-2xl shadow-slate-900/20 backdrop:bg-slate-950/60 backdrop:backdrop-blur-sm"
    >
      <div className="p-6">
        <div className="flex items-start gap-4">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-lg ${color}`}>
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
            <div className="mt-2 text-sm leading-relaxed text-slate-600">{children}</div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          {onConfirm || onApprove ? (
            <>
              <Button variant="ghost" size="sm" onClick={onClose}>
                {cancelLabel ?? "Cancel"}
              </Button>
              {onConfirm && (
                <Button
                  variant={variant === "error" ? "danger" : "primary"}
                  size="sm"
                  onClick={() => { onConfirm(); onClose(); }}
                >
                  {confirmLabel ?? "OK"}
                </Button>
              )}
              {onApprove && (
                <Button
                  variant="approve"
                  size="sm"
                  onClick={() => { onApprove(); onClose(); }}
                >
                  {approveLabel ?? "Approve"}
                </Button>
              )}
            </>
          ) : (
            <Button variant="secondary" size="sm" onClick={onClose}>
              {confirmLabel ?? "OK"}
            </Button>
          )}
        </div>
      </div>
    </dialog>
  );
}
