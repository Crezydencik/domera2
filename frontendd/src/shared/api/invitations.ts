import { apiFetch } from "@/shared/api/client";

export function getInvitations(email?: string) {
  const query = email ? `?email=${encodeURIComponent(email)}` : "";
  return apiFetch<{ items?: Record<string, unknown>[] }>(`/invitations${query}`);
}
