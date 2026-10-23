"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/shared/server/api-client";

type UploadInvoiceResponse = {
  success?: boolean;
  invoice_id?: string;
  approval_id?: string;
  message?: string;
  error?: string;
};

type BatchMutationResponse = {
  success?: boolean;
  total?: number;
  processed?: number;
  failed?: number;
  message?: string;
};

export type InvoiceActionResult = {
  success: boolean;
  message?: string;
};

async function runInvoiceAction(action: () => Promise<unknown>): Promise<InvoiceActionResult> {
  try {
    await action();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error && error.message ? error.message : "Unable to complete the invoice action.",
    };
  }
}

function revalidateBillingViews() {
  revalidatePath("/invoices");
  revalidatePath("/apartments");
}

export async function uploadInvoiceAction(formData: FormData) {
  const response = await apiFetch<UploadInvoiceResponse>("/invoices/upload", {
    method: "POST",
    body: formData,
  });
  revalidateBillingViews();
  return response;
}

export async function approvePendingInvoiceApprovalAction(approvalId: string, notifyRecipients = true) {
  const response = await apiFetch<{ success?: boolean; invoice_id?: string; message?: string }>(
    `/invoices/pending-approvals/${encodeURIComponent(approvalId)}/approve`,
    { method: "POST", body: JSON.stringify({ notifyRecipients }) },
  );
  revalidateBillingViews();
  return response;
}

export async function approvePendingInvoiceApprovalsAction(approvalIds: string[], notifyRecipients = true, notifyApprovalIds: string[] = []) {
  const response = await apiFetch<BatchMutationResponse>("/invoices/pending-approvals/approve-all", {
    method: "POST",
    body: JSON.stringify({ approvalIds, notifyRecipients, notifyApprovalIds }),
  });
  revalidateBillingViews();
  return response;
}

export async function cancelPendingInvoiceApprovalAction(approvalId: string) {
  const response = await apiFetch<{ success?: boolean; message?: string }>(
    `/invoices/pending-approvals/${encodeURIComponent(approvalId)}`,
    { method: "DELETE" },
  );
  revalidateBillingViews();
  return response;
}

export async function cancelPendingInvoiceApprovalsAction(approvalIds: string[]) {
  const response = await apiFetch<BatchMutationResponse>("/invoices/pending-approvals/cancel-all", {
    method: "POST",
    body: JSON.stringify({ approvalIds }),
  });
  revalidateBillingViews();
  return response;
}

export async function deleteInvoicesAction(invoiceIds: string[]) {
  const response = await apiFetch<BatchMutationResponse>("/invoices/delete-all", {
    method: "POST",
    body: JSON.stringify({ invoiceIds }),
  });
  revalidateBillingViews();
  return response;
}

export async function deleteInvoiceAction(invoiceId: string): Promise<InvoiceActionResult> {
  const result = await runInvoiceAction(() => apiFetch<{ success?: boolean }>(`/invoices/${encodeURIComponent(invoiceId)}`, {
    method: "DELETE",
  }));
  if (result.success) {
    // A successful backend deletion must not be reported as failed just because
    // Next.js cache invalidation is unavailable for this Server Action.
    try {
      revalidateBillingViews();
    } catch {
      // The client calls router.refresh() after a successful result.
    }
  }
  return result;
}

export async function resendInvoiceEmailAction(invoiceId: string): Promise<InvoiceActionResult> {
  return runInvoiceAction(() => apiFetch<{ success?: boolean }>(`/invoices/${encodeURIComponent(invoiceId)}/resend-email`, {
    method: "POST",
  }));
}
