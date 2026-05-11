"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/shared/api/client";
import { getNotifications } from "@/shared/api/notifications";
import { useAuthSession } from "@/shared/hooks/use-auth";
import type { NotificationItem } from "@/shared/lib/data";
import { ROUTES } from "@/shared/lib/routes";

type UnknownRecord = Record<string, unknown>;

const METER_READINGS_CHANGED_EVENT = "domera:meter-readings-changed";
const OWNER_METER_READING_STATUS_EVENT = "domera:owner-meter-reading-status";

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
  };
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
  const response = await apiFetch<{ apartments?: UnknownRecord[] }>("/resident/apartments");
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
  const [ownerMissingReadings, setOwnerMissingReadings] = useState(0);
  const [ownerMissingApartmentLabels, setOwnerMissingApartmentLabels] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) {
      setItems([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [response, missingApartmentLabels] = await Promise.all([
        getNotifications(userId),
        dashboardRole !== "managementCompany" ? loadOwnerMissingReadingStatus().catch(() => []) : Promise.resolve([]),
      ]);
      const nextItems = Array.isArray(response.items)
        ? response.items.map((item) => toNotificationItem(item as UnknownRecord))
        : [];

      setItems(nextItems);
      setOwnerMissingReadings(missingApartmentLabels.length);
      setOwnerMissingApartmentLabels(missingApartmentLabels);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : t("loadError");
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [dashboardRole, t, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    window.addEventListener(METER_READINGS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(METER_READINGS_CHANGED_EVENT, refresh);
  }, [refresh]);

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
    };

    window.addEventListener(OWNER_METER_READING_STATUS_EVENT, handleOwnerStatus);
    return () => window.removeEventListener(OWNER_METER_READING_STATUS_EVENT, handleOwnerStatus);
  }, []);

  const computedOwnerNotification = useMemo<NotificationItem | null>(() => {
    if (dashboardRole === "managementCompany" || ownerMissingReadings <= 0) return null;

    const visibleLabels = ownerMissingApartmentLabels.slice(0, 3);
    const apartmentText = ownerMissingReadings === 1
      ? t("missingReadingsApartmentSingle", { apartment: visibleLabels[0] ?? "" })
      : t("missingReadingsApartmentMultiple", {
          apartments: visibleLabels.join(", "),
          count: ownerMissingReadings,
          suffix: ownerMissingReadings > 3 ? "..." : "",
        });

    return {
      id: `owner-meter-readings-local-${currentMonthKey()}`,
      title: t("missingReadingsTitle"),
      description: t("missingReadingsDescription", { apartmentText }),
      channel: t("readingsChannel"),
      actionHref: ROUTES.meterReadings,
      actionLabel: t("submitReadings"),
    };
  }, [dashboardRole, ownerMissingApartmentLabels, ownerMissingReadings, t]);

  const allItems = useMemo(
    () => (computedOwnerNotification ? [computedOwnerNotification, ...items] : items),
    [computedOwnerNotification, items],
  );
  const previewItems = useMemo(() => allItems.slice(0, previewLimit), [allItems, previewLimit]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((value) => !value), []);
  const dismiss = useCallback((notificationId: string) => {
    setItems((current) => current.filter((item) => item.id !== notificationId));
  }, []);

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
