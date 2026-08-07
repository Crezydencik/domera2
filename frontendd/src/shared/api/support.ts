import { apiFetch } from "@/shared/api/client";

export type SupportFeedbackPriority = "low" | "normal" | "high";
export const SUPPORT_CHANGED_EVENT = "domera:support-changed";

function notifySupportChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SUPPORT_CHANGED_EVENT));
}

export type CreateSupportFeedbackPayload = {
  subject: string;
  message: string;
  priority: SupportFeedbackPriority;
};

export type SupportFeedbackMessage = {
  id: string;
  author: "user" | "admin";
  body: string;
  userId: string | null;
  userEmail: string | null;
  createdAt: string | null;
};

export type SupportFeedbackItem = {
  id: string;
  userId: string | null;
  userEmail: string | null;
  userRole: string | null;
  companyId: string | null;
  subject: string;
  message: string;
  priority: SupportFeedbackPriority;
  status: string;
  messages: SupportFeedbackMessage[];
  completedAt: string | null;
  completedBy: string | null;
  archivedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export async function createSupportFeedback(payload: CreateSupportFeedbackPayload) {
  const response = await apiFetch<{ id: string; success: boolean }>("/support/feedback", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  notifySupportChanged();
  return response;
}

export function listSupportFeedback() {
  return apiFetch<{ items: SupportFeedbackItem[] }>("/support/feedback", {
    skipClientCache: true,
  });
}

export function listSupportFeedbackInbox(status: "active" | "archived" = "active") {
  return apiFetch<{ items: SupportFeedbackItem[] }>(`/support/feedback?status=${status}`, {
    skipClientCache: true,
  });
}

export function listMySupportFeedback() {
  return apiFetch<{ items: SupportFeedbackItem[] }>("/support/feedback/mine", {
    skipClientCache: true,
  });
}

export async function addSupportFeedbackMessage(feedbackId: string, message: string) {
  const response = await apiFetch<SupportFeedbackItem>(`/support/feedback/${feedbackId}/messages`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
  notifySupportChanged();
  return response;
}

export async function completeSupportFeedback(feedbackId: string) {
  const response = await apiFetch<SupportFeedbackItem>(`/support/feedback/${feedbackId}/complete`, {
    method: "PATCH",
    body: JSON.stringify({}),
  });
  notifySupportChanged();
  return response;
}
