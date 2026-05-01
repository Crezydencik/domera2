"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getNotifications } from "@/shared/api/notifications";
import { useAuthSession } from "@/shared/hooks/use-auth";
import type { NotificationItem } from "@/shared/lib/data";

type UnknownRecord = Record<string, unknown>;

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function toNotificationItem(item: UnknownRecord): NotificationItem {
  return {
    id: firstString(item.id, item.notificationId, item.createdAt, crypto?.randomUUID?.() ?? String(Math.random())),
    title: firstString(item.title, item.subject, item.type, "Update"),
    description: firstString(item.description, item.message, item.body, "No details available."),
    channel: firstString(item.channel, item.type, "General"),
  };
}

interface UseAppNotificationsOptions {
  previewLimit?: number;
}

export function useAppNotifications(options: UseAppNotificationsOptions = {}) {
  const { previewLimit = 5 } = options;
  const { isAuthenticated, userId } = useAuthSession();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !userId) {
      setItems([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await getNotifications(userId);
      const nextItems = Array.isArray(response.items)
        ? response.items.map((item) => toNotificationItem(item as UnknownRecord))
        : [];

      setItems(nextItems);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Failed to load notifications.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const previewItems = useMemo(() => items.slice(0, previewLimit), [items, previewLimit]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((value) => !value), []);

  return {
    items,
    previewItems,
    count: items.length,
    hasItems: items.length > 0,
    isLoading,
    error,
    isOpen,
    open,
    close,
    toggle,
    refresh,
  };
}