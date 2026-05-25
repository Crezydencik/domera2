import { apiFetch } from "@/shared/api/client";

export type NotificationSettings = {
  general: boolean;
  meterReminder: boolean;
  paymentReminder: boolean;
  language: "ru" | "lv" | "en";
};

export function getNotifications(userId?: string) {
  const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  return apiFetch<{ items?: Record<string, unknown>[] }>(`/notifications${query}`);
}

export function getNotificationSettings() {
  return apiFetch<{ settings: NotificationSettings }>("/notifications/settings");
}

export function updateNotificationSettings(payload: Partial<NotificationSettings>) {
  return apiFetch<{ success?: boolean; settings: NotificationSettings }>("/notifications/settings", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
