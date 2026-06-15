"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/shared/lib/domera-api.server";

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

export async function approvePendingInvoiceApprovalAction(approvalId: string) {
  const response = await apiFetch<{ success?: boolean; invoice_id?: string; message?: string }>(
    `/invoices/pending-approvals/${encodeURIComponent(approvalId)}/approve`,
    { method: "POST" },
  );
  revalidateBillingViews();
  return response;
}

export async function approvePendingInvoiceApprovalsAction(approvalIds: string[]) {
  const response = await apiFetch<BatchMutationResponse>("/invoices/pending-approvals/approve-all", {
    method: "POST",
    body: JSON.stringify({ approvalIds }),
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

export async function deleteInvoiceAction(invoiceId: string) {
  const response = await apiFetch<{ success?: boolean }>(`/invoices/${encodeURIComponent(invoiceId)}`, {
    method: "DELETE",
  });
  revalidateBillingViews();
  return response;
}

export async function resendInvoiceEmailAction(invoiceId: string) {
  return apiFetch<{ success?: boolean }>(`/invoices/${encodeURIComponent(invoiceId)}/resend-email`, {
    method: "POST",
  });
}
