"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, DomeraApiError } from "@/shared/api/client";
import { getNotificationSettings, getNotifications, markNotificationRead, removeNotification, type NotificationSettings } from "@/shared/api/notifications";
import { useAuthSession } from "@/shared/hooks/use-auth";
import type { NotificationItem } from "@/shared/lib/data";
import { ROUTES } from "@/shared/lib/routes";

type UnknownRecord = Record<string, unknown>;

const METER_READINGS_CHANGED_EVENT = "domera:meter-readings-changed";
const OWNER_METER_READING_STATUS_EVENT = "domera:owner-meter-reading-status";
const defaultNotificationSettings: NotificationSettings = {
  general: true,
  meterReminder: true,
  paymentReminder: true,
  language: "ru",
};

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function toNotificationItem(item: UnknownRecord): NotificationItem {
  return {
    id: firstString(item.id, item.notificationId, item.createdAt, crypto?.randomUUID?.() ?? String(Math.random())),
    title: firstString(item.title, item.subject, item.type, "Update"),
    description: firstString(item.description, item.message, item.body, "No details available."),
    channel: firstString(item.channel, item.type, "General"),
    actionHref: firstString(item.actionHref),
    actionLabel: firstString(item.actionLabel),
    type: firstString(item.type),
    apartmentNumber: firstString(item.apartmentNumber),
    buildingName: firstString(item.buildingName),
    buildingAddress: firstString(item.buildingAddress),
    companyName: firstString(item.companyName),
    requesterEmail: firstString(item.requesterEmail),
  };
}

function normalizedKeyPart(value?: string) {
  return (value ?? "").trim().toLowerCase();
}

function isBuildingCreationNotification(item: NotificationItem) {
  return item.type === "building-creation-request" || normalizedKeyPart(item.title) === "building creation request";
}

function notificationDedupeKey(item: NotificationItem) {
  if (item.type === "owner-invitation") {
    return `owner-invitation:${normalizedKeyPart(item.apartmentNumber)}:${normalizedKeyPart(item.buildingName)}`;
  }

  if (isBuildingCreationNotification(item)) {
    const specificKey = [
      item.companyName,
      item.buildingName,
      item.buildingAddress,
      item.requesterEmail,
    ]
      .map(normalizedKeyPart)
      .filter(Boolean)
      .join(":");

    if (specificKey) {
      return `building-creation-request:${specificKey}`;
    }

    return [
      "building-creation-request",
      normalizedKeyPart(item.title),
      normalizedKeyPart(item.description),
      normalizedKeyPart(item.channel),
      normalizedKeyPart(item.actionHref),
    ].join(":");
  }

  return item.id;
}

function dedupeNotifications(items: NotificationItem[]) {
  const visibleItems: NotificationItem[] = [];
  const itemsByKey = new Map<string, NotificationItem>();
  const idsByVisibleId = new Map<string, string[]>();

  for (const item of items) {
    const key = notificationDedupeKey(item);
    const visibleItem = itemsByKey.get(key);

    if (visibleItem) {
      idsByVisibleId.set(visibleItem.id, [...(idsByVisibleId.get(visibleItem.id) ?? [visibleItem.id]), item.id]);
      continue;
    }

    itemsByKey.set(key, item);
    visibleItems.push(item);
    idsByVisibleId.set(item.id, [item.id]);
  }

  return { visibleItems, idsByVisibleId };
}

function currentMonthKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function meterKeysFromApartment(apartment: UnknownRecord) {
  const waterReadings = apartment.waterReadings && typeof apartment.waterReadings === "object"
    ? apartment.waterReadings as UnknownRecord
    : {};
  const meterKeys = (["coldmeterwater", "hotmeterwater"] as const).filter((key) => {
    const meter = waterReadings[key];
    if (!meter || typeof meter !== "object") return false;

    const data = meter as UnknownRecord;
    return Boolean(firstString(data.meterId, data.id, data.serialNumber));
  });

  return meterKeys.length > 0 ? meterKeys : (["coldmeterwater", "hotmeterwater"] as const);
}

function readingMonthKey(reading: UnknownRecord) {
  const month = Number(reading.month);
  const year = Number(reading.year);

  if (Number.isFinite(month) && Number.isFinite(year) && month > 0) {
    return `${year}-${String(month).padStart(2, "0")}`;
  }

  return firstString(reading.submittedAt, reading.createdAt).slice(0, 7);
}

async function loadOwnerMissingReadingStatus() {
  const month = currentMonthKey();
  const response = await apiFetch<{ apartments?: UnknownRecord[] }>("/resident/apartments", {
    redirectOnAuthError: false,
  });
  const apartments = Array.isArray(response.apartments) ? response.apartments : [];
  const missingApartmentLabels: string[] = [];

  await Promise.all(
    apartments.map(async (apartment) => {
      const apartmentId = firstString(apartment.id, apartment.apartmentId);
      const apartmentLabel = firstString(apartment.number, apartment.apartmentNumber, apartment.readableId, apartmentId);
      const requiredMeterKeys = meterKeysFromApartment(apartment);

      if (!apartmentId || requiredMeterKeys.length === 0) return;

      const readingsResponse = await apiFetch<{ items?: UnknownRecord[] }>(
        `/meter-readings?apartmentId=${encodeURIComponent(apartmentId)}`,
        { redirectOnAuthError: false },
      ).catch(() => ({ items: [] }));
      const submittedKeys = new Set(
        (readingsResponse.items ?? [])
          .filter((reading) => readingMonthKey(reading) === month)
          .map((reading) => firstString(reading.meterKey)),
      );

      if (!requiredMeterKeys.every((key) => submittedKeys.has(key))) {
        missingApartmentLabels.push(`№ ${apartmentLabel}`);
      }
    }),
  );

  return missingApartmentLabels;
}

export function notifyMeterReadingsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(METER_READINGS_CHANGED_EVENT));
}

export function notifyOwnerMeterReadingStatus(missingApartmentCount: number, apartmentLabels: string[] = []) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(OWNER_METER_READING_STATUS_EVENT, {
      detail: { apartmentLabels, missingApartmentCount },
    }),
  );
}

interface UseAppNotificationsOptions {
  previewLimit?: number;
}

export function useAppNotifications(options: UseAppNotificationsOptions = {}) {
  const { previewLimit = 5 } = options;
  const t = useTranslations("appShell.header.notifications");
  const { dashboardRole, userId } = useAuthSession();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [settings, setSettings] = useState<NotificationSettings>(defaultNotificationSettings);
  const [ownerMissingReadings, setOwnerMissingReadings] = useState(0);
  const [ownerMissingApartmentLabels, setOwnerMissingApartmentLabels] = useState<string[]>([]);
  const [ownerStatusLoaded, setOwnerStatusLoaded] = useState(false);
  const [dismissedLocalNotificationIds, setDismissedLocalNotificationIds] = useState<Set<string>>(() => new Set());
  const [duplicateNotificationIdsById, setDuplicateNotificationIdsById] = useState<Map<string, string[]>>(() => new Map());
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const canLoadOwnerStatus = useCallback(
    (nextSettings: NotificationSettings) =>
      dashboardRole !== "managementCompany" && nextSettings.general && nextSettings.meterReminder,
    [dashboardRole],
  );

  const loadOwnerStatus = useCallback(
    async (nextSettings = settings) => {
      if (!userId || !canLoadOwnerStatus(nextSettings)) {
        setOwnerMissingReadings(0);
        setOwnerMissingApartmentLabels([]);
        setOwnerStatusLoaded(true);
        return;
      }

      const missingApartmentLabels = await loadOwnerMissingReadingStatus().catch(() => []);
      setOwnerMissingReadings(missingApartmentLabels.length);
      setOwnerMissingApartmentLabels(missingApartmentLabels);
      setOwnerStatusLoaded(true);
    },
    [canLoadOwnerStatus, settings, userId],
  );

  const refresh = useCallback(async () => {
    if (!userId) {
      setItems([]);
      setDuplicateNotificationIdsById(new Map());
      setError(null);
      setOwnerMissingReadings(0);
      setOwnerMissingApartmentLabels([]);
      setOwnerStatusLoaded(true);
      setHasLoaded(true);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [settingsResponse, response] = await Promise.all([
        getNotificationSettings().catch(() => ({ settings: defaultNotificationSettings })),
        getNotifications(userId),
      ]);
      const nextSettings = settingsResponse.settings;
      setSettings(nextSettings);

      const allItems = Array.isArray(response.items)
        ? response.items.map((item) => toNotificationItem(item as UnknownRecord))
        : [];

      const { visibleItems, idsByVisibleId } = dedupeNotifications(allItems);

      setDuplicateNotificationIdsById(idsByVisibleId);
      setItems(visibleItems);
      if (canLoadOwnerStatus(nextSettings)) {
        setOwnerStatusLoaded(false);
      } else {
        setOwnerMissingReadings(0);
        setOwnerMissingApartmentLabels([]);
        setOwnerStatusLoaded(true);
      }
    } catch (caughtError) {
      const message = caughtError instanceof DomeraApiError && caughtError.status >= 500
        ? t("loadError")
        : caughtError instanceof Error ? caughtError.message : t("loadError");
      setError(message);
    } finally {
      setHasLoaded(true);
      setIsLoading(false);
    }
  }, [canLoadOwnerStatus, t, userId]);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (!cancelled) void refresh();
    };

    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(run, { timeout: 1500 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(idleId);
      };
    }

    const timeoutId = window.setTimeout(run, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [refresh]);

  useEffect(() => {
    const handleChange = () => {
      void refresh();
      void loadOwnerStatus();
    };

    window.addEventListener(METER_READINGS_CHANGED_EVENT, handleChange);
    return () => window.removeEventListener(METER_READINGS_CHANGED_EVENT, handleChange);
  }, [loadOwnerStatus, refresh]);

  useEffect(() => {
    const handleOwnerStatus = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail as { apartmentLabels?: unknown; missingApartmentCount?: unknown } : {};
      const nextCount = Number(detail.missingApartmentCount ?? 0);

      setOwnerMissingReadings(Number.isFinite(nextCount) ? Math.max(0, nextCount) : 0);
      setOwnerMissingApartmentLabels(
        Array.isArray(detail.apartmentLabels)
          ? detail.apartmentLabels.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          : [],
      );
      setOwnerStatusLoaded(true);
    };

    window.addEventListener(OWNER_METER_READING_STATUS_EVENT, handleOwnerStatus);
    return () => window.removeEventListener(OWNER_METER_READING_STATUS_EVENT, handleOwnerStatus);
  }, []);

  useEffect(() => {
    if (isOpen && !hasLoaded) {
      void refresh();
    }

    if (isOpen && !ownerStatusLoaded) {
      void loadOwnerStatus();
    }
  }, [hasLoaded, isOpen, loadOwnerStatus, ownerStatusLoaded, refresh]);

  const computedOwnerNotification = useMemo<NotificationItem | null>(() => {
    if (!settings.general || !settings.meterReminder || dashboardRole === "managementCompany" || ownerMissingReadings <= 0) return null;
    const notificationId = `owner-meter-readings-local-${currentMonthKey()}`;
    if (dismissedLocalNotificationIds.has(notificationId)) return null;

    const visibleLabels = ownerMissingApartmentLabels.slice(0, 3);
    const apartmentText = ownerMissingReadings === 1
      ? t("missingReadingsApartmentSingle", { apartment: visibleLabels[0] ?? "" })
      : t("missingReadingsApartmentMultiple", {
          apartments: visibleLabels.join(", "),
          count: ownerMissingReadings,
          suffix: ownerMissingReadings > 3 ? "..." : "",
        });

    return {
      id: notificationId,
      title: t("missingReadingsTitle"),
      description: t("missingReadingsDescription", { apartmentText }),
      channel: t("readingsChannel"),
      actionHref: ROUTES.meterReadings,
      actionLabel: t("submitReadings"),
    };
  }, [dashboardRole, dismissedLocalNotificationIds, ownerMissingApartmentLabels, ownerMissingReadings, settings.general, settings.meterReminder, t]);

  const allItems = useMemo(
    () => (computedOwnerNotification ? [computedOwnerNotification, ...items] : items),
    [computedOwnerNotification, items],
  );
  const previewItems = useMemo(() => allItems.slice(0, previewLimit), [allItems, previewLimit]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((value) => !value), []);
  const dismiss = useCallback(async (notificationId: string) => {
    if (notificationId.startsWith("owner-meter-readings-local-")) {
      setDismissedLocalNotificationIds((current) => new Set(current).add(notificationId));
      return;
    }

    const notificationIds = duplicateNotificationIdsById.get(notificationId) ?? [notificationId];
    const notificationIdsSet = new Set(notificationIds);

    setItems((current) => current.filter((item) => !notificationIdsSet.has(item.id) && item.id !== notificationId));
    setDuplicateNotificationIdsById((current) => {
      const next = new Map(current);
      next.delete(notificationId);
      return next;
    });

    try {
      await Promise.all(notificationIds.map(async (id) => {
        try {
          await markNotificationRead(id);
        } catch {
          await removeNotification(id);
        }
      }));
    } catch {
      await refresh();
    }
  }, [duplicateNotificationIdsById, refresh]);

  return {
    items: allItems,
    previewItems,
    count: allItems.length,
    hasItems: allItems.length > 0,
    isLoading,
    error,
    isOpen,
    open,
    close,
    toggle,
    refresh,
    dismiss,
  };
}
