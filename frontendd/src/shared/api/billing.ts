import { apiFetch } from "@/shared/api/client";

export type UploadInvoiceParams = {
  file: File | Blob;
  fileName?: string;
  buildingId: string;
  apartmentId: string;
  period: string;
  invoiceDate: string;
  amount: string | number;
  currency: string;
  externalId: string;
  meterReadingId?: string;
  queueApproval?: boolean;
  status: string;
  comment?: string;
  companyId?: string;
  source?: "api" | "manual";
};

export type UploadInvoiceResponse = {
  success: boolean;
  invoice_id?: string;
  approval_id?: string;
  message?: string;
  error?: string;
};

export type InvoiceUploadHistoryResponse = {
  items?: Record<string, unknown>[];
};

export type PendingInvoiceApprovalsResponse = {
  items?: Record<string, unknown>[];
};

export function getInvoices(query: { companyId?: string; apartmentId?: string; userId?: string } = {}) {
  const params = new URLSearchParams();

  if (query.companyId) params.set("companyId", query.companyId);
  if (query.apartmentId) params.set("apartmentId", query.apartmentId);
  if (query.userId) params.set("userId", query.userId);

  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<{ items?: Record<string, unknown>[] }>(`/invoices${suffix}`);
}

export function uploadInvoice(params: UploadInvoiceParams) {
  const formData = new FormData();
  formData.append("file", params.file, params.fileName ?? "invoice.pdf");
  formData.append("buildingId", params.buildingId);
  formData.append("apartmentId", params.apartmentId);
  formData.append("period", params.period);
  formData.append("invoiceDate", params.invoiceDate);
  formData.append("amount", String(params.amount));
  formData.append("currency", params.currency);
  formData.append("externalId", params.externalId);
  if (params.meterReadingId?.trim()) formData.append("meterReadingId", params.meterReadingId.trim());
  if (params.queueApproval) formData.append("queueApproval", "true");
  formData.append("status", params.status);
  formData.append("source", params.source ?? "manual");

  if (params.comment?.trim()) formData.append("comment", params.comment.trim());
  if (params.companyId?.trim()) formData.append("companyId", params.companyId.trim());

  return apiFetch<UploadInvoiceResponse>("/invoices/upload", {
    method: "POST",
    body: formData,
  });
}

export function getInvoiceUploadHistory(query: { companyId?: string; buildingId?: string; limit?: number } = {}) {
  const params = new URLSearchParams();
  if (query.companyId) params.set("companyId", query.companyId);
  if (query.buildingId) params.set("buildingId", query.buildingId);
  if (query.limit) params.set("limit", String(query.limit));

  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<InvoiceUploadHistoryResponse>(`/invoices/uploads${suffix}`);
}

export function getPendingInvoiceApprovals(query: { companyId?: string; buildingId?: string; limit?: number } = {}) {
  const params = new URLSearchParams();
  if (query.companyId) params.set("companyId", query.companyId);
  if (query.buildingId) params.set("buildingId", query.buildingId);
  if (query.limit) params.set("limit", String(query.limit));

  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<PendingInvoiceApprovalsResponse>(`/invoices/pending-approvals${suffix}`);
}

export function approvePendingInvoiceApproval(approvalId: string) {
  return apiFetch<{ success?: boolean; invoice_id?: string; message?: string }>(
    `/invoices/pending-approvals/${encodeURIComponent(approvalId)}/approve`,
    { method: "POST" },
  );
}

export function approvePendingInvoiceApprovals(approvalIds: string[]) {
  return apiFetch<{ success?: boolean; total?: number; processed?: number; failed?: number; message?: string }>(
    "/invoices/pending-approvals/approve-all",
    {
      method: "POST",
      body: JSON.stringify({ approvalIds }),
    },
  );
}

export function cancelPendingInvoiceApproval(approvalId: string) {
  return apiFetch<{ success?: boolean; message?: string }>(
    `/invoices/pending-approvals/${encodeURIComponent(approvalId)}`,
    { method: "DELETE" },
  );
}

export function cancelPendingInvoiceApprovals(approvalIds: string[]) {
  return apiFetch<{ success?: boolean; total?: number; processed?: number; failed?: number; message?: string }>(
    "/invoices/pending-approvals/cancel-all",
    {
      method: "POST",
      body: JSON.stringify({ approvalIds }),
    },
  );
}

export function deleteInvoice(invoiceId: string) {
  return apiFetch<{ success?: boolean }>(`/invoices/${encodeURIComponent(invoiceId)}`, {
    method: "DELETE",
  });
}
