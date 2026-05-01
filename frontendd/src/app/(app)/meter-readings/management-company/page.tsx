"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
// import { useAuthSession } from "@/shared/hooks/use-auth";
import { SectionCard } from "@/components/section-card";
import { FilterBar, useFilters, type FilterField } from "@/components/ui/filter-bar";
import { Modal } from "@/components/ui/modal";
import { SubmissionPeriodCard, type SubmissionPeriodValue } from "@/components/ui/submission-period-card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/shared/api/client";
import { useNotifications } from "@/shared/hooks/use-notifications";
import MeterReadingInput from "../../../../components/ui/meter-reading-input";

interface MeterReadingRecord {
  id: string;
  currentValue: string;
  previousValue: string;
  consumption: string;
  submittedAt: string;
  month?: number;
  year?: number;
  status: "submitted" | "pending" | "verified";
}

interface MeterInfo {
  meterType: string;
  meterKey?: "coldmeterwater" | "hotmeterwater";
  meterId?: string;
  serialNumber?: string;
  readings: MeterReadingRecord[];
  latestReading: MeterReadingRecord | null;
}

interface ApartmentMeterData {
  id: string;
  apartmentId: string;
  apartment: string;
  building: string;
  buildingLabel: string;
  meters: MeterInfo[];
}

export default function ManagementCompanyPage() {
  const t = useTranslations("meterread");
  const notify = useNotifications();
  const [apartments, setApartments] = useState<ApartmentMeterData[]>([]); 
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { values: filterValues, setValue: setFilterValue } = useFilters({
    search: "",
    building: "",
    status: "all",
  });
  const searchQuery = filterValues.search;
  const selectedBuilding = filterValues.building;
  const statusFilter = filterValues.status;
  const [expandedApartments, setExpandedApartments] = useState<Set<string>>(new Set());
  const [periodOpen, setPeriodOpen] = useState(false);
  const [periodValue, setPeriodValue] = useState<SubmissionPeriodValue | null>(null);
  const [periodSaving, setPeriodSaving] = useState(false);
  const [periodDeleting, setPeriodDeleting] = useState(false);

  // Submission modal state
  const [selectAptOpen, setSelectAptOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitApt, setSubmitApt] = useState<ApartmentMeterData | null>(null);
  const [submitMonth, setSubmitMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [submitCold, setSubmitCold] = useState("");
  const [submitHot, setSubmitHot] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sendingTestReminder, setSendingTestReminder] = useState(false);

  // Period-aware status: 'submitted' (зелёный, сдано в текущем периоде),
  // 'pending' (жёлтый, период открыт, ещё не сдано), 'overdue' (красный,
  // период закрыт, не сдано). Если период не настроен — фолбэк 'submitted'.
  const getPeriodStatus = React.useCallback(
    (latestSubmittedAt?: string | null): "submitted" | "pending" | "overdue" => {
      const now = new Date();
      const curYear = now.getFullYear();
      const curMonth = now.getMonth();
      const prevMonth = curMonth === 0 ? 11 : curMonth - 1;
      const prevYear = curMonth === 0 ? curYear - 1 : curYear;

      // Парсим последнюю отправку (формат "DD/MM/YYYY, HH:mm" или ISO)
      let submittedDate: Date | null = null;
      if (latestSubmittedAt && latestSubmittedAt !== "—") {
        const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(latestSubmittedAt);
        if (m) submittedDate = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
        else {
          const d = new Date(latestSubmittedAt);
          if (!Number.isNaN(d.getTime())) submittedDate = d;
        }
      }

      // Если сдано в текущем месяце ИЛИ в предыдущем — показываем зелёный (submitted)
      const submittedThisOrPrevMonth = !!submittedDate && (
        (submittedDate.getFullYear() === curYear && submittedDate.getMonth() === curMonth) ||
        (submittedDate.getFullYear() === prevYear && submittedDate.getMonth() === prevMonth)
      );
      
      if (submittedThisOrPrevMonth) return "submitted";

      if (!periodValue?.startDate || !periodValue?.endDate) {
        return "pending";
      }
      const startD = new Date(periodValue.startDate);
      const endD = new Date(periodValue.endDate);
      if (Number.isNaN(startD.getTime()) || Number.isNaN(endD.getTime())) {
        return "pending";
      }
      let windowStart: Date;
      let windowEnd: Date;
      if (periodValue.monthly) {
        windowStart = new Date(curYear, curMonth, startD.getDate());
        windowEnd = new Date(curYear, curMonth, endD.getDate(), 23, 59, 59);
      } else {
        windowStart = startD;
        windowEnd = new Date(endD.getFullYear(), endD.getMonth(), endD.getDate(), 23, 59, 59);
      }

      if (now < windowStart) return "pending";
      if (now <= windowEnd) return "pending";
      return "overdue";
    },
    [periodValue],
  );

  const STATUS_CFG: Record<"submitted" | "pending" | "overdue", { dot: string; text: string; bg: string; border: string; label: string }> = {
    submitted: { dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", label: t("statusSubmitted") },
    pending: { dot: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", label: t("statusPending") },
    overdue: { dot: "bg-rose-500", text: "text-rose-700", bg: "bg-rose-50", border: "border-rose-200", label: t("statusOverdue") },
  };

  // View meters modal
  const [viewOpen, setViewOpen] = useState(false);
  const [viewApt, setViewApt] = useState<ApartmentMeterData | null>(null);
  const [viewSerials, setViewSerials] = useState<{ cold: string; hot: string }>({ cold: "", hot: "" });
  const [viewDates, setViewDates] = useState<{ cold: string; hot: string }>({ cold: "", hot: "" });
  const [viewLoading, setViewLoading] = useState(false);
  const [viewSaving, setViewSaving] = useState(false);

  const openViewModal = async (apt: ApartmentMeterData) => {
    setViewApt(apt);
    setViewOpen(true);
    setViewLoading(true);
    setViewSerials({
      cold: apt.meters.find((m) => m.meterKey === "coldmeterwater")?.serialNumber ?? "",
      hot: apt.meters.find((m) => m.meterKey === "hotmeterwater")?.serialNumber ?? "",
    });
    setViewDates({ cold: "", hot: "" });
    try {
      const data = (await apiFetch(`/apartments/${encodeURIComponent(apt.apartmentId)}`)) as Record<string, unknown> | null;
      const wr = (data?.waterReadings ?? {}) as Record<string, Record<string, unknown> | undefined>;
      const cold = wr.coldmeterwater ?? {};
      const hot = wr.hotmeterwater ?? {};
      const isoDate = (v: unknown): string => {
        if (!v) return "";
        if (typeof v === "string") {
          const d = new Date(v);
          if (Number.isNaN(d.getTime())) return "";
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        }
        return "";
      };
      setViewSerials({
        cold: typeof cold.serialNumber === "string" ? cold.serialNumber : (apt.meters.find((m) => m.meterKey === "coldmeterwater")?.serialNumber ?? ""),
        hot: typeof hot.serialNumber === "string" ? hot.serialNumber : (apt.meters.find((m) => m.meterKey === "hotmeterwater")?.serialNumber ?? ""),
      });
      setViewDates({
        cold: isoDate(cold.checkDueDate),
        hot: isoDate(hot.checkDueDate),
      });
    } catch (e) {
      console.error("Failed to load apartment", e);
    } finally {
      setViewLoading(false);
    }
  };

  const saveViewDates = async () => {
    if (!viewApt) return;
    try {
      setViewSaving(true);
      const body: Record<string, unknown> = {
        waterReadings: {
          coldmeterwater: {
            serialNumber: viewSerials.cold || null,
            checkDueDate: viewDates.cold || null,
          },
          hotmeterwater: {
            serialNumber: viewSerials.hot || null,
            checkDueDate: viewDates.hot || null,
          },
        },
      };
      await apiFetch(`/apartments/${encodeURIComponent(viewApt.apartmentId)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      // reflect updated serials in list state
      setApartments((prev) =>
        prev.map((a) =>
          a.apartmentId === viewApt.apartmentId
            ? {
                ...a,
                meters: a.meters.map((m) => {
                  if (m.meterKey === "coldmeterwater") return { ...m, serialNumber: viewSerials.cold || m.serialNumber };
                  if (m.meterKey === "hotmeterwater") return { ...m, serialNumber: viewSerials.hot || m.serialNumber };
                  return m;
                }),
              }
            : a,
        ),
      );
      notify.success(t("notifyMetersSaved"));
      setViewOpen(false);
    } catch (e) {
      console.error(e);
      notify.error(t("notifySaveError"));
    } finally {
      setViewSaving(false);
    }
  };

  const [deletingMonthKey, setDeletingMonthKey] = useState<string | null>(null);

  const deleteMonthReadings = async (apartmentId: string, monthKey: string, readingIds: string[]) => {
    if (!apartmentId || readingIds.length === 0) return;
    if (!window.confirm(t("confirmDeleteMonth", { monthKey }))) return;
    const tag = `${apartmentId}:${monthKey}`;
    try {
      setDeletingMonthKey(tag);
      // Секвенциально — иначе параллельные set({merge}) перезапишут друг друга.
      for (const readingId of readingIds) {
        await apiFetch(
          `/meter-readings/${encodeURIComponent(readingId)}?apartmentId=${encodeURIComponent(apartmentId)}`,
          { method: "DELETE" },
        );
      }
      setApartments((prev) =>
        prev.map((a) => {
          if (a.apartmentId !== apartmentId) return a;
          const idSet = new Set(readingIds);
          return {
            ...a,
            meters: a.meters.map((m) => {
              const filtered = m.readings.filter((r) => !idSet.has(r.id));
              return { ...m, readings: filtered, latestReading: filtered[0] ?? null };
            }),
          };
        }),
      );
      notify.success(t("notifyDeletedReadings", { monthKey }));
    } catch (e) {
      console.error(e);
      notify.error(t("notifyDeleteError"));
    } finally {
      setDeletingMonthKey(null);
    }
  };

  const sendTestReminder = async () => {
    try {
      setSendingTestReminder(true);
      await apiFetch("/meter-readings/test-reminder", { method: "POST" });
      notify.success(t("notifyTestEmailSent"));
    } catch (e) {
      console.error(e);
      notify.error(t("notifyEmailError"));
    } finally {
      setSendingTestReminder(false);
    }
  };

  const openSubmitModal = (apt: ApartmentMeterData) => {
    setSubmitApt(apt);
    setSubmitCold("");
    setSubmitHot("");
    const d = new Date();
    setSubmitMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    setSubmitOpen(true);
  };

  const submitReadings = async () => {
    if (!submitApt) return;
    const [yearStr, monthStr] = submitMonth.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    const coldMeter = submitApt.meters.find((m) => m.meterKey === "coldmeterwater" || m.meterType.toLowerCase().includes("cold"));
    const hotMeter = submitApt.meters.find((m) => m.meterKey === "hotmeterwater" || m.meterType.toLowerCase().includes("hot"));
    const buildBody = (meter: MeterInfo, currentValueStr: string) => {
      const currentValue = Number(currentValueStr.replace(",", "."));
      const previousValue = Number(meter.latestReading?.currentValue ?? meter.latestReading?.previousValue ?? 0);
      return {
        apartmentId: submitApt.apartmentId,
        meterId: meter.meterId ?? meter.serialNumber ?? "",
        meterKey: meter.meterKey,
        previousValue,
        currentValue,
        consumption: Math.max(0, currentValue - previousValue),
        buildingId: submitApt.building,
        month,
        year,
      };
    };
    try {
      setSubmitting(true);
      // Валидация: текущее показание не должно быть меньше предыдущего.
      const violations: string[] = [];
      const checkBelowPrevious = (meter: MeterInfo | undefined, raw: string, label: string) => {
        if (!meter || !raw) return;
        const currentValue = Number(raw.replace(",", "."));
        const previousValue = Number(meter.latestReading?.currentValue ?? meter.latestReading?.previousValue ?? 0);
        if (Number.isFinite(currentValue) && Number.isFinite(previousValue) && currentValue < previousValue) {
          violations.push(`${label}: ${currentValue} < ${previousValue}`);
        }
      };
      checkBelowPrevious(coldMeter, submitCold, t("coldWater"));
      checkBelowPrevious(hotMeter, submitHot, t("hotWater"));
      if (violations.length > 0) {
        notify.error(t("notifyBelowPrevious", { violations: violations.join("; ") }));
        return;
      }
      let count = 0;
      // Секвенциально: два параллельных письма в документ apartments перезапишут друг друга.
      if (coldMeter && submitCold) {
        await apiFetch(`/meter-readings`, { method: "POST", body: JSON.stringify(buildBody(coldMeter, submitCold)) });
        count += 1;
      }
      if (hotMeter && submitHot) {
        await apiFetch(`/meter-readings`, { method: "POST", body: JSON.stringify(buildBody(hotMeter, submitHot)) });
        count += 1;
      }
      if (count === 0) {
        notify.info(t("notifyEnterAtLeastOne"));
        return;
      }
      // Локальное обновление без перезагрузки
      setApartments((prev) =>
        prev.map((a) => {
          if (a.apartmentId !== submitApt.apartmentId) return a;
          const now = new Date();
          const submittedAtStr = now.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          });
          return {
            ...a,
            meters: a.meters.map((m) => {
              if (coldMeter && submitCold && (m.meterKey === "coldmeterwater" || m.meterId === coldMeter.meterId)) {
                const currentVal = Number(submitCold.replace(",", "."));
                const prevVal = Number(m.latestReading?.currentValue ?? 0);
                return {
                  ...m,
                  latestReading: {
                    id: m.latestReading?.id ?? "",
                    previousValue: String(prevVal),
                    currentValue: String(currentVal),
                    consumption: String(Math.max(0, currentVal - prevVal)),
                    submittedAt: submittedAtStr,
                    month,
                    year,
                    status: "submitted" as const,
                  },
                };
              }
              if (hotMeter && submitHot && (m.meterKey === "hotmeterwater" || m.meterId === hotMeter.meterId)) {
                const currentVal = Number(submitHot.replace(",", "."));
                const prevVal = Number(m.latestReading?.currentValue ?? 0);
                return {
                  ...m,
                  latestReading: {
                    id: m.latestReading?.id ?? "",
                    previousValue: String(prevVal),
                    currentValue: String(currentVal),
                    consumption: String(Math.max(0, currentVal - prevVal)),
                    submittedAt: submittedAtStr,
                    month,
                    year,
                    status: "submitted" as const,
                  },
                };
              }
              return m;
            }),
          };
        }),
      );
      notify.success(t("notifyReadingsSent"));
      setSubmitOpen(false);
    } catch (e) {
      console.error(e);
      notify.error(t("notifySendError"));
    } finally {
      setSubmitting(false);
    }
  };
  // Ключ: все данные только после монтирования
  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Сначала получаем профиль пользователя
        let userId: string | null = null;
        let companyId: string | null = null;

        if (typeof document !== "undefined") {
          const cookies = document.cookie.split(";").reduce((acc: Record<string, string>, cookie) => {
            const [key, value] = cookie.trim().split("=");
            acc[key] = decodeURIComponent(value || "");
            return acc;
          }, {} as Record<string, string>);
          userId = cookies.userId || null;
        }

        if (!userId) {
          setError("User ID not found. Please re-login.");
          setLoading(false);
          return;
        }

        // Получаем профиль пользователя, который содержит companyId
        const profileResponse = await apiFetch(`/users/${encodeURIComponent(userId)}`);
        const profile = profileResponse as Record<string, unknown>;
        
        companyId = (typeof profile.companyId === "string" && profile.companyId) ||
                   (typeof profile.uid === "string" && profile.uid) ||
                   null;

        if (!companyId) {
          setError("Company ID not found in your profile. Please verify your account setup.");
          setLoading(false);
          return;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const url = `/meter-readings?companyId=${encodeURIComponent(String(companyId))}`;
        const rawResponse = await apiFetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        const response = rawResponse as unknown;
        const items = Array.isArray(response)
          ? (response as unknown[])
          : ((response as { items?: unknown[] })?.items ?? []);
        
        if (isMounted) {
          if (items.length > 0) {
            // Группируем показания по квартирам
            const apartmentMap = new Map<string, ApartmentMeterData>();

            items.forEach((item: unknown) => {
              const i = item as Record<string, unknown>;
              const apartmentId = String(i.apartmentId || "");
              const apartmentNumber = String(
                i.apartmentNumber || i.apartment || apartmentId || "—"
              );
              const buildingId = String(i.buildingId || "");
              const buildingName = String(i.buildingName || "");
              const buildingAddress = String(i.buildingAddress || "");
              const buildingLabel = buildingAddress || buildingName || (buildingId ? `#${buildingId}` : "Unknown");
              const building = buildingId || buildingLabel;
              
              // Определяем тип счётчика
              let meterType = "Water";
              const meterKey = String(i.meterKey || "");
              const meterNameValue = String(i.meterName || "");
              
              if (meterKey === "hotmeterwater" || meterNameValue.toLowerCase().includes("hot")) {
                meterType = "Hot Water";
              } else if (meterKey === "coldmeterwater" || meterNameValue.toLowerCase().includes("cold")) {
                meterType = "Cold Water";
              }

              // Парсим ISO 8601 дату от бэкенда
              let date: Date | null = null;
              if (i.submittedAt) {
                date = new Date(String(i.submittedAt));
              }
              const formattedDate = date && !Number.isNaN(date.getTime())
                ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
                : "—";

              const reading: MeterReadingRecord = {
                id: String(i.id || Math.random()),
                currentValue: String(i.currentValue || "0"),
                previousValue: String(i.previousValue || "0"),
                consumption: String(i.consumption || "0"),
                submittedAt: formattedDate,
                month: typeof i.month === "number" ? i.month : Number(i.month) || undefined,
                year: typeof i.year === "number" ? i.year : Number(i.year) || undefined,
                status: (i.status as "submitted" | "pending" | "verified") || "submitted",
              };

              const meterKeyTyped =
                meterKey === "hotmeterwater" || meterKey === "coldmeterwater"
                  ? (meterKey as "hotmeterwater" | "coldmeterwater")
                  : undefined;
              const meterIdValue = i.meterId ? String(i.meterId) : undefined;

              if (apartmentMap.has(apartmentId)) {
                const existing = apartmentMap.get(apartmentId)!;
                // Ищем существующий счётчик того же типа
                const existingMeter = existing.meters.find(m => m.meterType === meterType);
                if (existingMeter) {
                  existingMeter.readings.push(reading);
                  existingMeter.readings.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
                  existingMeter.latestReading = existingMeter.readings[0];
                  if (!existingMeter.serialNumber && i.serialNumber) {
                    existingMeter.serialNumber = String(i.serialNumber);
                  }
                  if (!existingMeter.meterKey && meterKeyTyped) existingMeter.meterKey = meterKeyTyped;
                  if (!existingMeter.meterId && meterIdValue) existingMeter.meterId = meterIdValue;
                } else {
                  // Добавляем новый тип счётчика
                  existing.meters.push({
                    meterType,
                    meterKey: meterKeyTyped,
                    meterId: meterIdValue,
                    serialNumber: i.serialNumber ? String(i.serialNumber) : undefined,
                    readings: [reading],
                    latestReading: reading,
                  });
                }
              } else {
                apartmentMap.set(apartmentId, {
                  id: apartmentId,
                  apartmentId: apartmentId,
                  apartment: apartmentNumber,
                  building: building,
                  buildingLabel: buildingLabel,
                  meters: [{
                    meterType,
                    meterKey: meterKeyTyped,
                    meterId: meterIdValue,
                    serialNumber: i.serialNumber ? String(i.serialNumber) : undefined,
                    readings: [reading],
                    latestReading: reading,
                  }],
                });
              }
            });

            const apartmentList = Array.from(apartmentMap.values());
            setApartments(apartmentList);
          } else {
            setApartments([]);
          }
        }
      } catch (err) {
        console.error("Error loading meter readings:", err);
        setError("Failed to load meter readings");
        setApartments([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    return () => {
      isMounted = false;
    };
  }, []);

  const buildings = [...new Set(apartments.map((r) => r.building))].sort();
  const buildingLabels = new Map<string, string>();
  apartments.forEach((a) => {
    if (!buildingLabels.has(a.building)) buildingLabels.set(a.building, a.buildingLabel || a.building);
  });
  const effectiveBuilding =
    selectedBuilding && buildings.includes(selectedBuilding)
      ? selectedBuilding
      : (buildings[0] ?? "");

  React.useEffect(() => {
    if (selectedBuilding !== effectiveBuilding) {
      setFilterValue("building", effectiveBuilding);
    }
  }, [effectiveBuilding, selectedBuilding, setFilterValue]);

  // Load saved submission period for selected building
  React.useEffect(() => {
    if (!effectiveBuilding) {
      setPeriodValue(null);
      return;
    }
    let cancelled = false;
    apiFetch(`/buildings/${encodeURIComponent(effectiveBuilding)}`)
      .then((res) => {
        if (cancelled) return;
        const cfg = (res as { readingConfig?: { submissionPeriod?: SubmissionPeriodValue | null } })
          ?.readingConfig?.submissionPeriod;
        setPeriodValue(cfg ?? null);
      })
      .catch(() => {
        if (!cancelled) setPeriodValue(null);
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveBuilding]);

  const savePeriod = async (value: SubmissionPeriodValue) => {
    if (!effectiveBuilding) return;
    setPeriodSaving(true);
    try {
      await apiFetch(`/buildings/${encodeURIComponent(effectiveBuilding)}`, {
        method: "PATCH",
        body: JSON.stringify({ readingConfig: { submissionPeriod: value } }),
        headers: { "Content-Type": "application/json" },
      });
      setPeriodValue(value);
      setPeriodOpen(false);
      notify.success(t("notifyPeriodSaved"));
    } catch (e) {
      console.error("Failed to save submission period", e);
      notify.error(t("notifyPeriodSaveError"));
    } finally {
      setPeriodSaving(false);
    }
  };

  // If monthly, derive the current month's window from saved day numbers.
  const resolveCurrentPeriod = React.useCallback(
    (v: SubmissionPeriodValue | null): { startDate: string; endDate: string } | null => {
      if (!v?.startDate || !v?.endDate) return null;
      if (!v.monthly) return { startDate: v.startDate, endDate: v.endDate };
      const today = new Date();
      const y = today.getFullYear();
      const m = today.getMonth();
      const startDay = new Date(v.startDate).getDate();
      const endDay = new Date(v.endDate).getDate();
      const lastOfMonth = new Date(y, m + 1, 0).getDate();
      const clamp = (d: number) => Math.min(Math.max(d, 1), lastOfMonth);
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return {
        startDate: fmt(new Date(y, m, clamp(startDay))),
        endDate: fmt(new Date(y, m, clamp(endDay))),
      };
    },
    [],
  );

  const currentPeriod = resolveCurrentPeriod(periodValue);
  const formatShort = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const periodButtonLabel = currentPeriod
    ? `${formatShort(currentPeriod.startDate)} — ${formatShort(currentPeriod.endDate)}`
    : t("period");

  const deletePeriod = async () => {
    setPeriodDeleting(true);
    try {
      await apiFetch(`/buildings/${encodeURIComponent(effectiveBuilding)}`, {
        method: "PATCH",
        body: JSON.stringify({ readingConfig: { submissionPeriod: null } }),
        headers: { "Content-Type": "application/json" },
      });
      setPeriodValue(null);
      setPeriodOpen(false);
      notify.success(t("notifyPeriodDeleted"));
    } catch (e) {
      console.error("Failed to delete submission period", e);
      notify.error(t("notifyPeriodDeleteError"));
    } finally {
      setPeriodDeleting(false);
    }
  };

  const filterFields: FilterField[] = [
    { name: "search", type: "search", placeholder: t("searchPlaceholder") },
    {
      name: "building",
      type: "select",
      visible: buildings.length > 1,
      options: buildings.map((b) => ({ value: b, label: buildingLabels.get(b) || b })),
    },
    {
      name: "status",
      type: "select",
      options: [
        { value: "all", label: t("statusAll") },
        { value: "submitted", label: t("statusSubmitted") },
        { value: "pending", label: t("statusPending") },
        { value: "verified", label: t("statusVerified") },
      ],
    },
  ];

  const filteredApartments = apartments.filter((item) => {
    if (effectiveBuilding && item.building !== effectiveBuilding) return false;
    if (searchQuery && !item.apartment.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (statusFilter !== "all") {
      // Проверяем, есть ли хотя бы один счётчик с нужным статусом
      const hasStatus = item.meters.some(m => m.latestReading?.status === statusFilter);
      if (!hasStatus) return false;
    }
    return true;
  });

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedApartments);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedApartments(newExpanded);
  };

  const toggleMonth = (monthKey: string) => {
    const key = `month-${monthKey}`;
    const newExpanded = new Set(expandedApartments);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedApartments(newExpanded);
  };
  return (
    <div className="space-y-6">
      <Modal
        open={periodOpen}
        onClose={() => setPeriodOpen(false)}
        title={t("periodModalTitle")}
        size="lg"
      >
        <SubmissionPeriodCard
          bare
          hideHeader
          buildingLabel={buildingLabels.get(effectiveBuilding)}
          value={periodValue}
          onSave={savePeriod}
          onDelete={deletePeriod}
          saving={periodSaving}
          deleting={periodDeleting}
        />
      </Modal>

      <Modal
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        title={t("submitModalTitle")}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="primary" onClick={() => setSubmitOpen(false)}>
              {t("close")}
            </Button>
            <Button
              variant="primary"
              onClick={submitReadings}
              disabled={submitting}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {submitting ? t("sending") : t("send")}
            </Button>
          </div>
        }
      >
        {submitApt && (
          <div className="space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("selectApartmentLabel")}</label>
              <div className="flex h-11 w-full items-center rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm text-slate-800">
                {submitApt.apartment}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("monthLabel")}</label>
              <input
                type="month"
                value={submitMonth}
                onChange={(e) => setSubmitMonth(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
              />
            </div>

            {(() => {
              const cold = submitApt.meters.find((m) => m.meterKey === "coldmeterwater" || m.meterType.toLowerCase().includes("cold"));
              const hot = submitApt.meters.find((m) => m.meterKey === "hotmeterwater" || m.meterType.toLowerCase().includes("hot"));
              const [yearStr, monthStr] = submitMonth.split("-");
              const currentPeriodLabel = `${monthStr}.${yearStr}`;
              const prevD = new Date(Number(yearStr), Number(monthStr) - 2, 1);
              const previousPeriodLabel = `${String(prevD.getMonth() + 1).padStart(2, "0")}.${prevD.getFullYear()}`;
              return (
                <div className="space-y-5">
                  {cold && (
                    <MeterReadingInput
                      variant="cold"
                      label={t("coldWater")}
                      serialNumber={cold.serialNumber}
                      previousValue={cold.latestReading?.currentValue ?? cold.latestReading?.previousValue ?? "—"}
                      previousPeriod={previousPeriodLabel}
                      currentPeriod={currentPeriodLabel}
                      value={submitCold}
                      onChange={setSubmitCold}
                      labels={{ previous: t("previousReading"), current: t("currentReading"), serialPrefix: t("serialPrefix") }}
                    />
                  )}
                  {hot && (
                    <MeterReadingInput
                      variant="hot"
                      label={t("hotWater")}
                      serialNumber={hot.serialNumber}
                      previousValue={hot.latestReading?.currentValue ?? hot.latestReading?.previousValue ?? "—"}
                      previousPeriod={previousPeriodLabel}
                      currentPeriod={currentPeriodLabel}
                      value={submitHot}
                      onChange={setSubmitHot}
                      labels={{ previous: t("previousReading"), current: t("currentReading"), serialPrefix: t("serialPrefix") }}
                    />
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </Modal>

      <Modal
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        title={t("viewModalTitle")}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setViewOpen(false)}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              {t("cancel")}
            </button>
            <Button variant="primary" onClick={saveViewDates} disabled={viewSaving}>
              {viewSaving ? t("saving") : t("save")}
            </Button>
          </div>
        }
      >
        {viewApt && (
          <div className="space-y-4">
            <p className="-mt-1 text-xs text-slate-400">{t("pressEscToClose")}{viewLoading ? ` · ${t("loadingShort")}` : ""}</p>
            {viewApt.meters.map((m) => {
              const isHot = m.meterKey === "hotmeterwater" || m.meterType.toLowerCase().includes("hot");
              const dot = isHot ? "bg-rose-500" : "bg-blue-500";
              const label = isHot ? t("hotWaterFull") : t("coldWaterFull");
              const slot: "cold" | "hot" = isHot ? "hot" : "cold";
              const key = m.meterKey ?? m.serialNumber ?? m.meterType;
              return (
                <div key={key} className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
                  <div className="mb-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                    <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                    <span className="text-sm font-medium text-slate-800">{label}</span>
                  </div>
                  <div className="mb-3">
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("meterNumber")}</label>
                    <input
                      type="text"
                      value={viewSerials[slot]}
                      onChange={(e) => setViewSerials((prev) => ({ ...prev, [slot]: e.target.value }))}
                      placeholder={t("meterNumber")}
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">{t("checkDate")}</label>
                    <input
                      type="date"
                      value={viewDates[slot]}
                      onChange={(e) => setViewDates((prev) => ({ ...prev, [slot]: e.target.value }))}
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      {/* Select Apartment Modal */}
      <Modal
        open={selectAptOpen}
        onClose={() => setSelectAptOpen(false)}
        title={t("selectAptModalTitle")}
        size="md"
      >
        <div className="space-y-4">
          <select
            onChange={(e) => {
              if (e.target.value) {
                const apt = filteredApartments.find(a => a.apartmentId === e.target.value);
                if (apt) {
                  setSelectAptOpen(false);
                  openSubmitModal(apt);
                }
              }
            }}
            defaultValue=""
            className="w-full px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent"
          >
            <option value="">{t("selectApartmentPlaceholder")}</option>
            {filteredApartments.map((apt) => (
              <option key={apt.apartmentId} value={apt.apartmentId}>
                {apt.apartment}
              </option>
            ))}
          </select>
        </div>
      </Modal>

      <SectionCard 
        title={buildingLabels.get(effectiveBuilding) || t("selectBuilding")}
        titleMeta={
          effectiveBuilding && (
            <div className="flex items-center gap-2">
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                {filteredApartments.length > 0 ? (
                  <>
                    <span className="text-slate-900">{filteredApartments.length}</span>
                    {` ${t("apts")}`}
                  </>
                ) : (
                  t("noData")
                )}
              </div>
            </div>
          )
        }
      > 
        <FilterBar
          fields={filterFields}
          values={{ ...filterValues, building: effectiveBuilding }}
          onChange={setFilterValue}
          actions={
            <>
              <button
                type="button"
                onClick={() => setPeriodOpen(true)}
                disabled={!effectiveBuilding}
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                title={periodValue?.monthly ? t("periodMonthly") : t("periodModalTitle")}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
                {periodButtonLabel}
                {periodValue?.monthly && (
                  <svg className="h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="ежемесячно">
                    <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
                    <path d="M21 3v5h-5" />
                  </svg>
                )}
              </button>
              <button
                type="button"
                onClick={() => setSelectAptOpen(true)}
                disabled={filteredApartments.length === 0}
                className="inline-flex items-center justify-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-1"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                {t("submit")}
              </button>
              <button className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-slate-400">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                {t("export")}
              </button>
              <button
                type="button"
                onClick={sendTestReminder}
                disabled={sendingTestReminder}
                title="Send test meter reading reminder email"
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-1 focus:ring-slate-400"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                {sendingTestReminder ? t("sendingTestEmail") : t("testEmail")}
              </button>
            </>
          }
          footer={
            <>
              <span className="font-semibold text-slate-700">{filteredApartments.length}</span>{" "}
              {filteredApartments.length === 1 ? t("readingsCount", { count: 1 }) : t("readingsCountPlural", { count: filteredApartments.length })}
            </>
          }
        />

        {/* Table */}
        {loading ? (
          <div className="rounded-md border border-slate-200 bg-white p-10 text-center">
            <div className="inline-flex items-center gap-3 text-sm text-slate-600">
              <div className="animate-spin h-4 w-4 border-2 border-slate-400 border-r-transparent rounded-full"></div>
              {t("loadingReadings")}
            </div>
          </div>
        ) : error ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-6">
            <div className="mb-2 text-sm font-semibold text-red-800">{t("errorTitle")}</div>
            <div className="mb-4 text-sm text-red-700">{error}</div>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              {t("retry")}
            </button>
          </div>
        ) : filteredApartments.length > 0 ? (
          <>
          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {filteredApartments.map((apt) => {
              const isExpanded = expandedApartments.has(apt.id);
              const dates = apt.meters
                .map((m) => m.latestReading?.submittedAt)
                .filter((d): d is string => Boolean(d) && d !== "—");
              const latestDate = dates.length > 0 ? dates.sort().reverse()[0] : "—";
              const cfg = STATUS_CFG[getPeriodStatus(latestDate)];
              return (
                <div key={apt.id} className="rounded-md border border-slate-200 bg-white">
                  <button
                    onClick={() => toggleExpanded(apt.id)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-semibold text-slate-900 tabular-nums">{apt.apartment} </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500 tabular-nums">
                        <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-medium ${cfg.bg} ${cfg.border} ${cfg.text}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </span>
                        <span className="text-slate-300">·</span>
                        <span>{latestDate}</span>  
                      </div>
                    </div>
                    <svg className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isExpanded ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                  </button>

                  <div className="border-t border-slate-100 px-3 py-3 space-y-2">
                    {apt.meters.map((meter, idx) => {
                      const isHot = meter.meterType.toLowerCase().includes("hot");
                      const dotColor = isHot ? "bg-red-500" : "bg-blue-500";
                      const consumptionColor = isHot ? "text-red-600" : "text-blue-600";
                      const currMonth = meter.latestReading?.month;
                      const currYear = meter.latestReading?.year;
                      const currLabel = currMonth && currYear ? `${currYear}.${String(currMonth).padStart(2, "0")}` : "";
                      let prevLabel = "";
                      if (currMonth && currYear) {
                        const prevM = currMonth === 1 ? 12 : currMonth - 1;
                        const prevY = currMonth === 1 ? currYear - 1 : currYear;
                        prevLabel = `${prevY}.${String(prevM).padStart(2, "0")}`;
                      }
                      return (
                        <div key={idx} className="rounded-md border border-slate-100 bg-slate-50/50 px-2.5 py-2">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
                              <span className="font-medium text-slate-700 truncate">{meter.meterType}</span>
                            </div>
                            <span className="font-mono text-[11px] text-slate-500 tabular-nums truncate">{meter.serialNumber ? `#${meter.serialNumber}` : "—"}</span>
                          </div>
                          <div className="mt-2 grid grid-cols-3 items-end gap-1 text-sm tabular-nums">
                            <div>
                              <div className="text-[10px] uppercase tracking-wide text-slate-400">{prevLabel || t("prevShort")}</div>
                              <div className="text-slate-500">{meter.latestReading?.previousValue ?? "—"}</div>
                            </div>
                            <div>
                              <div className="text-[10px] uppercase tracking-wide text-slate-400">{currLabel || t("currShort")}</div>
                              <div className="font-semibold text-slate-900">{meter.latestReading?.currentValue ?? "—"}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] uppercase tracking-wide text-slate-400">{t("useShort")}</div>
                              <div className={`font-semibold ${consumptionColor}`}>+{meter.latestReading?.consumption ?? "—"} m³</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    <div className="flex gap-2 pt-1">
                      <button className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                        {t("view")}
                      </button>
                      <button className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z"/></svg>
                        {t("edit")}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-3">
                      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">{t("history")}</h4>
                      <div className="space-y-2">
                        {(() => {
                          const byMonth = new Map<string, Array<{ meter: MeterInfo; r: MeterReadingRecord }>>();
                          apt.meters.forEach((meter) => {
                            meter.readings.forEach((r) => {
                              const key = r.submittedAt.substring(0, 7);
                              if (!byMonth.has(key)) byMonth.set(key, []);
                              byMonth.get(key)!.push({ meter, r });
                            });
                          });
                          const sortedMonths = Array.from(byMonth.keys()).sort((a, b) => b.localeCompare(a));
                          return sortedMonths.map((monthKey) => {
                            const [year, month] = monthKey.split("-");
                            const items = (byMonth.get(monthKey) || []).sort((a, b) => b.r.submittedAt.localeCompare(a.r.submittedAt));
                            const isMonthExpanded = expandedApartments.has(`month-${apt.id}-${monthKey}`);
                            return (
                              <div key={monthKey} className="rounded-md border border-slate-200 bg-white overflow-hidden">
                                <button
                                  onClick={() => toggleMonth(`${apt.id}-${monthKey}`)}
                                  className="flex w-full items-center justify-between gap-2 px-3 py-2 hover:bg-slate-50"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="font-mono text-xs font-semibold text-slate-700 tabular-nums">{year}-{month}</span>
                                    <span className="text-[11px] text-slate-400">{items.length === 1 ? t("readingsCount", { count: 1 }) : t("readingsCountPlural", { count: items.length })}</span>
                                  </div>
                                  <svg className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isMonthExpanded ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                                </button>
                                {isMonthExpanded && (
                                  <div className="border-t border-slate-100 px-2 py-2 space-y-1.5">
                                    {items.map(({ meter, r }) => {
                                      const isHot = meter.meterType.toLowerCase().includes("hot");
                                      const dotColor = isHot ? "bg-red-500" : "bg-blue-500";
                                      const consumptionColor = isHot ? "text-red-600" : "text-blue-600";
                                      return (
                                        <div key={r.id} className="flex items-center justify-between gap-2 rounded-md bg-slate-50/50 px-2.5 py-2 text-xs">
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
                                            <span className="font-medium text-slate-700 truncate">{meter.meterType}</span>
                                          </div>
                                          <div className="text-right tabular-nums">
                                            <div className="text-slate-500">{r.previousValue} → <span className="font-semibold text-slate-900">{r.currentValue}</span></div>
                                            <div className={`font-semibold ${consumptionColor}`}>+{r.consumption} m³</div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-hidden rounded-md border border-slate-200">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 w-10"></th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t("colApartment")}</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t("colMeter")}</th>
                  <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t("colReading")}</th>
                  <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t("colStatus")}</th>
                  <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t("colActions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredApartments.map((apt: ApartmentMeterData) => {
                  const isExpanded = expandedApartments.has(apt.id);
                  
                  return (
                    <React.Fragment key={apt.id}>
                      {/* Main Row */}
                      <tr className="border-t border-slate-100 hover:bg-slate-50/60 cursor-pointer transition-colors" onClick={() => toggleExpanded(apt.id)}>
                        <td className="px-3 py-3 text-center align-top">
                          <button className="text-slate-400 hover:text-slate-700 transition-transform inline-flex" aria-label={isExpanded ? t("history") : t("colApartment")}>
                            <svg className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                          </button>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <div className="font-semibold text-slate-900 tabular-nums">{apt.apartment}</div>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <div className="flex gap-1.5">
                            {apt.meters.map((meter, idx) => {
                              const isHot = meter.meterType.toLowerCase().includes("hot");
                              const dotColor = isHot ? "bg-red-500" : "bg-blue-500";
                              return (
                                <div key={idx} className="flex items-center gap-2 text-xs">
                                  <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
                                  <span className="font-mono text-slate-500 tabular-nums">{meter.serialNumber ? `#${meter.serialNumber}` : "—"}</span>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <div className="flex gap-1.5">
                            {apt.meters.map((meter, idx) => {
                              const currMonth = meter.latestReading?.month;
                              const currYear = meter.latestReading?.year;
                              const currLabel = currMonth && currYear ? `${currYear}.${String(currMonth).padStart(2, "0")}` : "";
                              let prevLabel = "";
                              if (currMonth && currYear) {
                                const prevM = currMonth === 1 ? 12 : currMonth - 1;
                                const prevY = currMonth === 1 ? currYear - 1 : currYear;
                                prevLabel = `${prevY}.${String(prevM).padStart(2, "0")}`;
                              }
                              const isHot = meter.meterType.toLowerCase().includes("hot");
                              const consumptionColor = isHot ? "text-red-600" : "text-blue-600";
                              return (
                                <div key={idx} className="flex items-center justify-center gap-2.5 text-sm tabular-nums">
                                  <div className="flex flex-col items-end leading-tight">
                                    {prevLabel && <span className="text-[10px] uppercase tracking-wide text-slate-400">{prevLabel}</span>}
                                    <span className="text-slate-500">{meter.latestReading?.previousValue ?? "—"}</span>
                                  </div>
                                  <svg className="h-3 w-3 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                                  <div className="flex flex-col items-end leading-tight">
                                    {currLabel && <span className="text-[10px] uppercase tracking-wide text-slate-400">{currLabel}</span>}
                                    <span className="font-semibold text-slate-900">{meter.latestReading?.currentValue ?? "—"}</span>
                                  </div>
                                  <span className="text-slate-300">=</span>
                                  <span className={`font-semibold ${consumptionColor}`}>+{meter.latestReading?.consumption ?? "—"} m³</span>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center align-middle">
                          {(() => {
                            const dates = apt.meters
                              .map((m) => m.latestReading?.submittedAt)
                              .filter((d): d is string => Boolean(d) && d !== "—");
                            const latestDate = dates.length > 0 ? dates.sort().reverse()[0] : undefined;
                            const cfg = STATUS_CFG[getPeriodStatus(latestDate)];
                            return (
                              <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.border} ${cfg.text}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                                {cfg.label}
                              </span>
                            );
                          })()}
                        </td>
                  
                        <td className="px-3 py-3 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-1 justify-center">
                            <button
                              onClick={() => openViewModal(apt)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                              title="Данные счётчиков"
                            >
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                            </button>
                            <button
                              onClick={() => openSubmitModal(apt)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                              title="Сдать показание"
                            >
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z"/></svg>
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded History */}
                      {isExpanded && (
                        <tr className="bg-slate-50/60">
                          <td colSpan={9} className="p-0">
                            <div className="px-4 py-4">
                              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-3">{t("readingHistory")}</h4>
                              <div className="space-y-2">
                                {(() => {
                                  // Группируем все показания по месяцам (YYYY-MM)
                                  const readingsByMonth = new Map<string, Array<{meter: MeterInfo, reading: MeterReadingRecord}>>();
                                  
                                  apt.meters.forEach(meter => {
                                    meter.readings.forEach(reading => {
                                      // Извлекаем YYYY-MM из submittedAt (формат: 2026-04-26T09:20:00)
                                      const monthKey = reading.submittedAt.substring(0, 7); // "2026-04"
                                      if (!readingsByMonth.has(monthKey)) {
                                        readingsByMonth.set(monthKey, []);
                                      }
                                      readingsByMonth.get(monthKey)!.push({meter, reading});
                                    });
                                  });
                                  
                                  // Сортируем месяцы по убыванию (новые первыми)
                                  const sortedMonths = Array.from(readingsByMonth.keys())
                                    .sort((a, b) => b.localeCompare(a))
                                    .filter(monthKey => {
                                      const monthReadings = readingsByMonth.get(monthKey) || [];
                                      return monthReadings.length > 0;
                                    });
                                  
                                  return sortedMonths.map(monthKey => {
                                    const [year, month] = monthKey.split('-');
                                    const monthLabel = `${year}-${month}`;
                                    const isMonthExpanded = expandedApartments.has(`month-${monthKey}`);
                                    const monthReadings = readingsByMonth.get(monthKey) || [];
                                    
                                    return (
                                      <div key={monthKey} className="border border-slate-200 rounded-md overflow-hidden bg-white">
                                        {/* Month Header */}
                                        <div className="flex items-center bg-white hover:bg-slate-50 transition-colors">
                                          <button
                                            type="button"
                                            onClick={() => toggleMonth(monthKey)}
                                            className="flex flex-1 items-center justify-between px-4 py-2.5"
                                          >
                                            <div className="flex items-center gap-3">
                                              <span className="font-mono text-sm font-semibold text-slate-700 tabular-nums">{year}-{month}</span>
                                              <span className="text-xs text-slate-500">{monthLabel}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                              <span className="text-[11px] uppercase tracking-wide text-slate-400">{monthReadings.length === 1 ? t("readingsCount", { count: 1 }) : t("readingsCountPlural", { count: monthReadings.length })}</span>
                                              <svg className={`h-4 w-4 text-slate-400 transition-transform ${isMonthExpanded ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                                            </div>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              deleteMonthReadings(
                                                apt.apartmentId,
                                                monthKey,
                                                monthReadings.map((r) => r.reading.id),
                                              );
                                            }}
                                            disabled={deletingMonthKey === `${apt.apartmentId}:${monthKey}`}
                                            className="mr-3 inline-flex h-7 w-7 items-center justify-center rounded-md border border-rose-200 bg-white text-rose-500 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                                            title={t("deleteReadingsTitle", { monthKey })}
                                          >
                                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                              <path d="M3 6h18" />
                                              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                              <path d="M10 11v6M14 11v6" />
                                            </svg>
                                          </button>
                                        </div>
                                        
                                        {/* Month Content */}
                                        {isMonthExpanded && (
                                          <div className="p-4 bg-white">
                                            <table className="w-full text-sm">
                                              <thead className="border-b border-slate-200">
                                                <tr className="text-slate-600 text-xs font-semibold uppercase">
                                                  <th className="text-left py-2 px-2">{t("colMeter")}</th>
                                                  <th className="text-left py-2 px-2">{t("colDate")}</th>
                                                  <th className="text-right py-2 px-2">{t("colPrevious")}</th>
                                                  <th className="text-right py-2 px-2">{t("colCurrent")}</th>
                                                  <th className="text-right py-2 px-2">{t("colConsumption")}</th>
                                                  <th className="text-center py-2 px-2">{t("colStatus")}</th>
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-slate-100">
                                                {monthReadings.map(item => {
                                                  // Форматируем дату: DD.MM.YYYY, HH:MM
                                                  const dateObj = new Date(item.reading.submittedAt);
                                                  const formattedDate = dateObj.toLocaleDateString('en-GB') + ', ' + dateObj.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'});
                                                  const dateParts = formattedDate.split(',');
                                                  const dateFormatted = dateParts[0] + ',' + dateParts[1];
                                                  
                                                  const isHot = item.meter.meterType.toLowerCase().includes("hot");
                                                  const dotColor = isHot ? "bg-red-500" : "bg-blue-500";
                                                  return (
                                                    <tr key={item.reading.id} className="hover:bg-slate-50">
                                                      <td className="py-2.5 px-2">
                                                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700">
                                                          <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
                                                          {item.meter.meterType}
                                                        </span>
                                                      </td>
                                                      <td className="py-2.5 px-2 text-slate-600 tabular-nums">{dateFormatted}</td>
                                                      <td className="py-2.5 px-2 text-right text-slate-500 tabular-nums">{item.reading.previousValue}</td>
                                                      <td className="py-2.5 px-2 text-right font-semibold text-slate-900 tabular-nums">{item.reading.currentValue}</td>
                                                      <td className="py-2.5 px-2 text-right tabular-nums font-semibold text-slate-700">+{item.reading.consumption}</td>
                                                      <td className="py-2.5 px-2 text-center">
                                                        {(() => {
                                                          const cfg = item.reading.status === "verified"
                                                            ? { dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", label: t("statusVerified") }
                                                            : item.reading.status === "pending"
                                                            ? { dot: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", label: t("statusPending") }
                                                            : { dot: "bg-slate-500", text: "text-slate-700", bg: "bg-slate-50", border: "border-slate-200", label: t("statusSubmitted") };
                                                          return (
                                                            <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium ${cfg.bg} ${cfg.border} ${cfg.text}`}>
                                                              <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                                                              {cfg.label}
                                                            </span>
                                                          );
                                                        })()}
                                                      </td>
                                                    </tr>
                                                  );
                                                })}
                                              </tbody>
                                            </table>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  });
                                })()}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
          </>
        ) : (
          <div className="rounded-md border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-slate-500">
            {t("noReadings")}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
