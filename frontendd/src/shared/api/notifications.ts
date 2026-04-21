import { apiFetch } from "@/shared/api/client";

export function getNotifications(userId?: string) {
  const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  return apiFetch<{ items?: Record<string, unknown>[] }>(`/notifications${query}`);
}
