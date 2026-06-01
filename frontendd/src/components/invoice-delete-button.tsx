"use client";

import { useState } from "react";
import { FiLoader, FiTrash2 } from "react-icons/fi";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { deleteInvoiceAction } from "@/shared/actions/billing";
import { useNotifications } from "@/shared/hooks/use-notifications";

type InvoiceDeleteButtonProps = {
  invoiceId: string;
  label: string;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  deletingLabel: string;
  successLabel: string;
  errorLabel: string;
};

export function InvoiceDeleteButton({
  invoiceId,
  label,
  title,
  message,
  confirmLabel,
  cancelLabel,
  deletingLabel,
  successLabel,
  errorLabel,
}: InvoiceDeleteButtonProps) {
  const confirm = useConfirm();
  const notifications = useNotifications();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    const confirmed = await confirm({
      title,
      message,
      confirmLabel,
      cancelLabel,
      variant: "danger",
    });

    if (!confirmed) return;

    try {
      setDeleting(true);
      await deleteInvoiceAction(invoiceId);
      notifications.success(successLabel);
    } catch (error) {
      notifications.error(error instanceof Error && error.message ? error.message : errorLabel);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleDelete()}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-200 text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={deleting}
      aria-label={label}
      title={label}
    >
      {deleting ? (
        <FiLoader className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <FiTrash2 className="h-4 w-4" aria-hidden="true" />
      )}
      <span className="sr-only">{deleting ? deletingLabel : label}</span>
    </button>
  );
}
