"use client";

import { useState } from "react";
import { FiLoader, FiSend } from "react-icons/fi";
import { resendInvoiceEmailAction } from "@/shared/actions/billing";
import { useNotifications } from "@/shared/hooks/use-notifications";

type InvoiceResendEmailButtonProps = {
  invoiceId: string;
  label: string;
  sendingLabel: string;
  successLabel: string;
  errorLabel: string;
};

export function InvoiceResendEmailButton({
  invoiceId,
  label,
  sendingLabel,
  successLabel,
  errorLabel,
}: InvoiceResendEmailButtonProps) {
  const notifications = useNotifications();
  const [sending, setSending] = useState(false);

  async function handleResend() {
    try {
      setSending(true);
      await resendInvoiceEmailAction(invoiceId);
      notifications.success(successLabel);
    } catch (error) {
      notifications.error(error instanceof Error && error.message ? error.message : errorLabel);
    } finally {
      setSending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleResend()}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-sky-200 text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={sending}
      aria-label={label}
      title={label}
    >
      {sending ? (
        <FiLoader className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <FiSend className="h-4 w-4" aria-hidden="true" />
      )}
      <span className="sr-only">{sending ? sendingLabel : label}</span>
    </button>
  );
}
