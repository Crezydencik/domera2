"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DomeraApiError } from "@/shared/api/client";
import { cancelBuildingCreationRequest, deleteBuilding, requestBuildingCreationAccess, updateBuilding, type BuildingMutationInput } from "@/shared/api/buildings";
import { useNotifications } from "@/shared/hooks/use-notifications";
import type { Building, BuildingReadingConfig } from "@/shared/lib/data";

type EditableBuilding = Building & {
  occupiedApartments: number;
};

type FormState = {
  name: string;
  address: string;
  apartmentsCount: string;
  subscriptionTermPreset: "1" | "2" | "5" | "custom";
  subscriptionTermYears: string;
  comment: string;
  readingConfig: BuildingReadingConfig;
};

type FormTab = "general" | "readings";

const EMPTY_FORM: FormState = {
  name: "",
  address: "",
  apartmentsCount: "0",
  subscriptionTermPreset: "1",
  subscriptionTermYears: "1",
  comment: "",
  readingConfig: {
    waterEnabled: false,
    electricityEnabled: false,
    heatingEnabled: false,
    hotWaterMetersPerResident: 1,
    coldWaterMetersPerResident: 1,
  },
};

function EditIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M4.75 13.9V15.25h1.35l7.96-7.96-1.35-1.35-7.96 7.96Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="m11.98 4.67 1.35-1.35a1.3 1.3 0 0 1 1.84 0l1.5 1.5a1.3 1.3 0 0 1 0 1.84l-1.35 1.35-3.34-3.34Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M5.75 6.5h8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 4.75h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7 7.25v6.25M10 7.25v6.25M13 7.25v6.25" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M6.25 6.5l.35 8.07A1.5 1.5 0 0 0 8.1 16h3.8a1.5 1.5 0 0 0 1.5-1.43l.35-8.07" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function RepeatIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M15.25 6.25A6.5 6.5 0 0 0 4.4 4.55L3.25 5.7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.25 2.75V5.7h2.95" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.75 13.75A6.5 6.5 0 0 0 15.6 15.45l1.15-1.15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16.75 17.25V14.3H13.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function parseOccupancy(value: string) {
  const match = value.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) {
    return { occupiedApartments: 0, apartmentsCount: 0 };
  }

  return {
    occupiedApartments: Number(match[1]) || 0,
    apartmentsCount: Number(match[2]) || 0,
  };
}

function normalizeBuilding(item: Building): EditableBuilding {
  const parsed = parseOccupancy(item.occupancy);

  return {
    ...item,
    occupiedApartments: parsed.occupiedApartments,
    apartments: parsed.apartmentsCount || item.apartments,
  };
}

function statusTone(status: string) {
  const normalized = status.trim().toLowerCase();

  if (normalized === "locked" || normalized === "blocked") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  if (normalized === "rejected" || normalized === "cancelled" || normalized === "canceled") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  if (normalized === "pending") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (normalized === "needs review" || normalized === "needsreview" || normalized === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function statusLabelKey(status: string) {
  const normalized = status.trim().toLowerCase();

  if (normalized === "rejected" || normalized === "cancelled" || normalized === "canceled") {
    return "cancelled";
  }

  if (normalized === "pending") {
    return "pending";
  }

  if (normalized === "needs review" || normalized === "needsreview" || normalized === "warning") {
    return "needsReview";
  }

  return "healthy";
}

function isPendingBuilding(status: string) {
  return status.trim().toLowerCase() === "pending";
}

function isRejectedBuilding(status: string) {
  const normalized = status.trim().toLowerCase();
  return normalized === "rejected" || normalized === "cancelled" || normalized === "canceled";
}

function isLockedBuilding(building: EditableBuilding) {
  return building.editLocked === true;
}

function firstOptionalText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function buildingReviewComment(building: EditableBuilding) {
  return firstOptionalText(
    building.rejectionComment,
    building.reviewComment,
    building.rejectedReason,
    building.buildingCreationAccessReviewComment,
  );
}

function getSubscriptionTermYears(building: EditableBuilding) {
  const years = Number(building.subscriptionTermYears);
  if (Number.isFinite(years) && years >= 1) {
    return Math.floor(years);
  }

  const months = Number(building.subscriptionTermMonths);
  if (Number.isFinite(months) && months >= 1) {
    return Math.max(1, Math.floor(months / 12));
  }

  return 1;
}

function buildPayloadFromBuilding(building: EditableBuilding): Omit<BuildingMutationInput, "companyId"> {
  const subscriptionTermYears = getSubscriptionTermYears(building);

  return {
    name: building.name,
    address: building.address,
    apartmentsCount: building.apartments,
    subscriptionTermYears,
    subscriptionTermMonths: subscriptionTermYears * 12,
    comment: building.comment ?? "",
    readingConfig: {
      waterEnabled: Boolean(building.readingConfig?.waterEnabled),
      electricityEnabled: Boolean(building.readingConfig?.electricityEnabled),
      heatingEnabled: Boolean(building.readingConfig?.heatingEnabled),
      hotWaterMetersPerResident: building.readingConfig?.hotWaterMetersPerResident ?? 1,
      coldWaterMetersPerResident: building.readingConfig?.coldWaterMetersPerResident ?? 1,
    },
  };
}

function getSubscriptionTermPreset(years: number): FormState["subscriptionTermPreset"] {
  if (years === 1 || years === 2 || years === 5) {
    return String(years) as FormState["subscriptionTermPreset"];
  }

  return "custom";
}

function ModalShell({
  open,
  title,
  description,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="Close"
        >
          ×
        </button>
        <div className="mb-5 pr-8">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          {description ? <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p> : null}
        </div>
        {children}
      </div>
    </div>
  );
}

function FormTabs({
  activeTab,
  generalLabel,
  readingsLabel,
  onChange,
}: {
  activeTab: FormTab;
  generalLabel: string;
  readingsLabel: string;
  onChange: (tab: FormTab) => void;
}) {
  return (
    <div className="mb-5 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
      {([
        ["general", generalLabel],
        ["readings", readingsLabel],
      ] as const).map(([tab, label]) => {
        const active = activeTab === tab;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onChange(tab)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              active
                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function ReadingToggle({
  checked,
  title,
  description,
  onChange,
}: {
  checked: boolean;
  title: string;
  description: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`flex w-full items-start justify-between rounded-2xl border px-4 py-4 text-left transition ${
        checked ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <div>
        <p className="font-medium text-slate-900">{title}</p>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <span
        className={`mt-0.5 inline-flex h-6 w-11 rounded-full p-1 transition ${checked ? "bg-blue-600" : "bg-slate-300"}`}
        aria-hidden="true"
      >
        <span className={`h-4 w-4 rounded-full bg-white transition ${checked ? "translate-x-5" : "translate-x-0"}`} />
      </span>
    </button>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const inputId = label.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <select
        id={inputId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const inputId = label.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <textarea
        id={inputId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
    </div>
  );
}

export function BuildingsManagement({
  companyId,
  buildings,
}: {
  companyId?: string;
  buildings: Building[];
}) {
  const t = useTranslations("buildings");
  const s = useTranslations("system");
  const ui = useTranslations("ui");
  const router = useRouter();
  const notifications = useNotifications();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<FormTab>("general");
  const [editingBuildingId, setEditingBuildingId] = useState<string | null>(null);
  const [deletingBuildingId, setDeletingBuildingId] = useState<string | null>(null);
  const [deletingBuildingName, setDeletingBuildingName] = useState<string>("");

  const rows = useMemo(() => buildings.map(normalizeBuilding), [buildings]);

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingBuildingId(null);
    setActiveTab("general");
  }

  function resetDeleteState() {
    setDeletingBuildingId(null);
    setDeletingBuildingName("");
  }

  function updateReadingConfig<K extends keyof BuildingReadingConfig>(key: K, value: BuildingReadingConfig[K]) {
    setForm((current) => ({
      ...current,
      readingConfig: {
        ...current.readingConfig,
        [key]: value,
      },
    }));
  }

  function toggleReading(key: "waterEnabled" | "electricityEnabled" | "heatingEnabled") {
    setForm((current) => {
      const nextEnabled = !current.readingConfig[key];
      return {
        ...current,
        readingConfig: {
          ...current.readingConfig,
          [key]: nextEnabled,
          ...(key === "waterEnabled" && !nextEnabled
            ? { hotWaterMetersPerResident: 0, coldWaterMetersPerResident: 0 }
            : key === "waterEnabled" && nextEnabled
              ? {
                  hotWaterMetersPerResident: current.readingConfig.hotWaterMetersPerResident || 1,
                  coldWaterMetersPerResident: current.readingConfig.coldWaterMetersPerResident || 1,
                }
              : {}),
        },
      };
    });
  }

  async function handleOpenCreate() {
    if (!companyId) {
      notifications.error(t("errors.companyMissing"));
      return;
    }

    resetForm();
    setCreateOpen(true);
  }

  function handleOpenEdit(building: EditableBuilding) {
    if (isLockedBuilding(building)) {
      notifications.warning("This building is locked by the platform administrator.");
      return;
    }

    const subscriptionTermYears = getSubscriptionTermYears(building);

    setEditingBuildingId(building.id);
    setForm({
      name: building.name,
      address: building.address,
      apartmentsCount: String(building.apartments),
      subscriptionTermPreset: getSubscriptionTermPreset(subscriptionTermYears),
      subscriptionTermYears: String(subscriptionTermYears),
      comment: building.comment ?? "",
      readingConfig: {
        waterEnabled: Boolean(building.readingConfig?.waterEnabled),
        electricityEnabled: Boolean(building.readingConfig?.electricityEnabled),
        heatingEnabled: Boolean(building.readingConfig?.heatingEnabled),
        hotWaterMetersPerResident: building.readingConfig?.hotWaterMetersPerResident ?? 1,
        coldWaterMetersPerResident: building.readingConfig?.coldWaterMetersPerResident ?? 1,
      },
    });
    setActiveTab("general");
    setEditOpen(true);
  }

  function handleOpenDelete(building: EditableBuilding) {
    if (isLockedBuilding(building)) {
      notifications.warning("This building is locked by the platform administrator.");
      return;
    }

    setDeletingBuildingId(building.id);
    setDeletingBuildingName(building.name);
    setDeleteOpen(true);
  }

  function buildPayload(): Omit<BuildingMutationInput, "companyId"> {
    const apartmentsCount = Number(form.apartmentsCount || "0");
    const subscriptionTermYears = Number(
      form.subscriptionTermPreset === "custom" ? form.subscriptionTermYears || "1" : form.subscriptionTermPreset,
    );
    const hotWaterMetersPerResident = Number(form.readingConfig.hotWaterMetersPerResident || 0);
    const coldWaterMetersPerResident = Number(form.readingConfig.coldWaterMetersPerResident || 0);

    if (!form.name.trim()) {
      throw new Error(t("errors.nameRequired"));
    }
    if (!form.address.trim()) {
      throw new Error(t("errors.addressRequired"));
    }
    if (!Number.isFinite(apartmentsCount) || apartmentsCount < 0) {
      throw new Error(t("errors.apartmentsCountInvalid"));
    }
    if (!Number.isFinite(subscriptionTermYears) || subscriptionTermYears < 1) {
      throw new Error(t("errors.subscriptionTermYearsInvalid"));
    }
    if (
      form.readingConfig.waterEnabled
      && (!Number.isFinite(hotWaterMetersPerResident) || hotWaterMetersPerResident < 0)
    ) {
      throw new Error(t("errors.hotWaterMetersInvalid"));
    }
    if (
      form.readingConfig.waterEnabled
      && (!Number.isFinite(coldWaterMetersPerResident) || coldWaterMetersPerResident < 0)
    ) {
      throw new Error(t("errors.coldWaterMetersInvalid"));
    }

    return {
      name: form.name.trim(),
      address: form.address.trim(),
      apartmentsCount,
      subscriptionTermYears: Math.floor(subscriptionTermYears),
      subscriptionTermMonths: Math.floor(subscriptionTermYears) * 12,
      comment: form.comment.trim(),
      readingConfig: {
        waterEnabled: form.readingConfig.waterEnabled,
        electricityEnabled: form.readingConfig.electricityEnabled,
        heatingEnabled: form.readingConfig.heatingEnabled,
        hotWaterMetersPerResident: form.readingConfig.waterEnabled ? Math.floor(hotWaterMetersPerResident) : 0,
        coldWaterMetersPerResident: form.readingConfig.waterEnabled ? Math.floor(coldWaterMetersPerResident) : 0,
      },
    };
  }

  async function handleCreate() {
    if (!companyId) {
      notifications.error(t("errors.companyMissing"));
      return;
    }

    setLoading(true);
    try {
      const payload = buildPayload();
      const response = await requestBuildingCreationAccess(companyId, payload);
      notifications.success(response.alreadyPending ? t("gating.requestAlreadyPending") : t("gating.requestSent"));
      setCreateOpen(false);
      resetForm();
      router.refresh();
    } catch (error) {
      notifications.error(error instanceof Error ? error.message : t("errors.createFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate() {
    if (!editingBuildingId) {
      notifications.error(t("errors.buildingMissing"));
      return;
    }

    setLoading(true);
    try {
      const payload = buildPayload();
      await updateBuilding(editingBuildingId, payload);
      notifications.success(t("feedback.updated", { building: payload.name }));
      setEditOpen(false);
      resetForm();
      router.refresh();
    } catch (error) {
      notifications.error(error instanceof Error ? error.message : t("errors.updateFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!deletingBuildingId) {
      notifications.error(t("errors.buildingMissing"));
      return;
    }

    setLoading(true);
    try {
      await deleteBuilding(deletingBuildingId);
      notifications.success(t("feedback.deleted", { building: deletingBuildingName || t("title") }));
      setDeleteOpen(false);
      resetDeleteState();
      router.refresh();
    } catch (error) {
      const message = error instanceof DomeraApiError && error.status === 409
        ? t("errors.deleteHasApartments")
        : error instanceof Error
          ? error.message
          : t("errors.deleteFailed");
      notifications.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCancelRequest(building: EditableBuilding) {
    setLoading(true);
    try {
      await cancelBuildingCreationRequest(building.id);
      notifications.success(t("feedback.requestCancelled", { building: building.name }));
      router.refresh();
    } catch (error) {
      notifications.error(error instanceof Error ? error.message : t("errors.requestCancelFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function handleRepeatRequest(building: EditableBuilding) {
    if (!companyId) {
      notifications.error(t("errors.companyMissing"));
      return;
    }

    setLoading(true);
    try {
      const response = await requestBuildingCreationAccess(companyId, buildPayloadFromBuilding(building), { requestId: building.id });
      notifications.success(
        response.alreadyPending
          ? t("gating.requestAlreadyPending")
          : t("feedback.requestRepeated", { building: building.name }),
      );
      router.refresh();
    } catch (error) {
      notifications.error(error instanceof Error ? error.message : t("errors.requestRepeatFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <SectionCard
        title={t("title")}
        description={t("description")}
        headerAside={
          <Button type="button" onClick={() => void handleOpenCreate()}>
            + {t("addButton")}
          </Button>
        }
      >
        <DataTable
          columns={[
            t("colBuilding"),
            t("colAddress"),
            t("colApartments"),
            t("colOccupancy"),
            t("fields.status"),
            t("colActions"),
          ]}
          rows={rows.map((item) => {
            const rejected = isRejectedBuilding(item.status || "");
            const reviewComment = buildingReviewComment(item);
            const displayStatus = rejected ? item.status || "Cancelled" : item.editLocked ? "Locked" : item.status || "Healthy";

            return [
              <div key={`${item.id}-name`}>
                <p className="font-medium text-slate-900">{item.name}</p>
              </div>,
              item.address,
              String(item.apartments),
              item.occupancy,
              <div key={`${item.id}-status`} className="flex items-center gap-2">
                <span
                  className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(displayStatus)}`}
                >
                  {rejected ? t("cancelled") : item.editLocked ? "Locked" : t(statusLabelKey(item.status || "Healthy"))}
                </span>
                {reviewComment ? (
                  <span
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-500"
                    title={reviewComment}
                    aria-label={reviewComment}
                  >
                    i
                  </span>
                ) : null}
              </div>,
              <div key={`${item.id}-actions`} className="flex justify-end gap-2">
                {isPendingBuilding(item.status || "") ? (
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    className="h-9 w-9 px-0"
                    onClick={() => void handleCancelRequest(item)}
                    disabled={loading}
                    aria-label={ui("delete")}
                    title={ui("delete")}
                  >
                    <TrashIcon />
                  </Button>
                ) : rejected ? (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-9 w-9 px-0"
                      onClick={() => void handleRepeatRequest(item)}
                      disabled={loading || isLockedBuilding(item)}
                      aria-label={t("repeatRequest")}
                      title={isLockedBuilding(item) ? "Building is locked by the platform administrator" : t("repeatRequest")}
                    >
                      <RepeatIcon />
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-9 w-9 px-0"
                      onClick={() => handleOpenEdit(item)}
                      disabled={loading || isLockedBuilding(item)}
                      aria-label={s("button.edit")}
                      title={isLockedBuilding(item) ? "Building is locked by the platform administrator" : s("button.edit")}
                    >
                      <EditIcon />
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      className="h-9 w-9 px-0"
                      onClick={() => handleOpenDelete(item)}
                      disabled={loading || isLockedBuilding(item)}
                      aria-label={ui("delete")}
                      title={isLockedBuilding(item) ? "Building is locked by the platform administrator" : ui("delete")}
                    >
                      <TrashIcon />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-9 w-9 px-0"
                      onClick={() => handleOpenEdit(item)}
                      disabled={loading || isLockedBuilding(item)}
                      aria-label={s("button.edit")}
                      title={isLockedBuilding(item) ? "Building is locked by the platform administrator" : s("button.edit")}
                    >
                      <EditIcon />
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      className="h-9 w-9 px-0"
                      onClick={() => handleOpenDelete(item)}
                      disabled={loading || isLockedBuilding(item)}
                      aria-label={ui("delete")}
                      title={isLockedBuilding(item) ? "Building is locked by the platform administrator" : ui("delete")}
                    >
                      <TrashIcon />
                    </Button>
                  </>
                )}
              </div>,
            ];
          })}
        />

        {rows.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
            <p className="font-medium text-slate-700">{t("emptyTitle")}</p>
            <p className="mt-1">{t("emptyDescription")}</p>
          </div>
        ) : null}
      </SectionCard>

      <ModalShell
        open={createOpen}
        onClose={() => !loading && setCreateOpen(false)}
        title={t("dialogs.create.title")}
        description={t("dialogs.create.description")}
      >
        <FormTabs
          activeTab={activeTab}
          generalLabel={t("tabs.general")}
          readingsLabel={t("tabs.readings")}
          onChange={setActiveTab}
        />

        {activeTab === "general" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Input label={t("fields.name")} value={form.name} onChange={(event) => updateForm("name", event.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Input label={s("form.address")} value={form.address} onChange={(event) => updateForm("address", event.target.value)} />
            </div>
            <Input label={t("fields.apartmentsCount")} type="number" min="0" value={form.apartmentsCount} onChange={(event) => updateForm("apartmentsCount", event.target.value)} />
            <SelectField
              label={t("fields.subscriptionTerm")}
              value={form.subscriptionTermPreset}
              onChange={(value) => {
                updateForm("subscriptionTermPreset", value as FormState["subscriptionTermPreset"]);
                if (value !== "custom") updateForm("subscriptionTermYears", value);
              }}
              options={[
                { value: "1", label: t("terms.oneYear") },
                { value: "2", label: t("terms.twoYears") },
                { value: "5", label: t("terms.fiveYears") },
                { value: "custom", label: t("terms.custom") },
              ]}
            />
            {form.subscriptionTermPreset === "custom" ? (
              <Input label={t("fields.subscriptionCustomTermYears")} type="number" min="1" step="1" value={form.subscriptionTermYears} onChange={(event) => updateForm("subscriptionTermYears", event.target.value)} />
            ) : null}
            <div className="sm:col-span-2">
              <TextAreaField label={t("fields.comment")} value={form.comment} onChange={(value) => updateForm("comment", value)} />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <ReadingToggle
              checked={form.readingConfig.waterEnabled}
              title={t("readings.water.title")}
              description={t("readings.water.description")}
              onChange={() => toggleReading("waterEnabled")}
            />
            {form.readingConfig.waterEnabled ? (
              <div className="grid gap-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 sm:grid-cols-2">
                <Input
                  label={t("fields.hotWaterMetersPerResident")}
                  type="number"
                  min="0"
                  value={String(form.readingConfig.hotWaterMetersPerResident)}
                  onChange={(event) => updateReadingConfig("hotWaterMetersPerResident", Number(event.target.value || 0))}
                />
                <Input
                  label={t("fields.coldWaterMetersPerResident")}
                  type="number"
                  min="0"
                  value={String(form.readingConfig.coldWaterMetersPerResident)}
                  onChange={(event) => updateReadingConfig("coldWaterMetersPerResident", Number(event.target.value || 0))}
                />
              </div>
            ) : null}
            <ReadingToggle
              checked={form.readingConfig.electricityEnabled}
              title={t("readings.electricity.title")}
              description={t("readings.electricity.description")}
              onChange={() => toggleReading("electricityEnabled")}
            />
            <ReadingToggle
              checked={form.readingConfig.heatingEnabled}
              title={t("readings.heating.title")}
              description={t("readings.heating.description")}
              onChange={() => toggleReading("heatingEnabled")}
            />
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)} disabled={loading}>
            {ui("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleCreate()} disabled={loading}>
            {loading ? t("gating.requesting") : t("gating.requestButton")}
          </Button>
        </div>
      </ModalShell>

      <ModalShell
        open={editOpen}
        onClose={() => !loading && setEditOpen(false)}
        title={t("dialogs.edit.title")}
        description={t("dialogs.edit.description")}
      >
        <FormTabs
          activeTab={activeTab}
          generalLabel={t("tabs.general")}
          readingsLabel={t("tabs.readings")}
          onChange={setActiveTab}
        />

        {activeTab === "general" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Input label={t("fields.name")} value={form.name} onChange={(event) => updateForm("name", event.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Input label={s("form.address")} value={form.address} onChange={(event) => updateForm("address", event.target.value)} />
            </div>
            <Input label={t("fields.apartmentsCount")} type="number" min="0" value={form.apartmentsCount} onChange={(event) => updateForm("apartmentsCount", event.target.value)} />
            <SelectField
              label={t("fields.subscriptionTerm")}
              value={form.subscriptionTermPreset}
              onChange={(value) => {
                updateForm("subscriptionTermPreset", value as FormState["subscriptionTermPreset"]);
                if (value !== "custom") updateForm("subscriptionTermYears", value);
              }}
              options={[
                { value: "1", label: t("terms.oneYear") },
                { value: "2", label: t("terms.twoYears") },
                { value: "5", label: t("terms.fiveYears") },
                { value: "custom", label: t("terms.custom") },
              ]}
            />
            {form.subscriptionTermPreset === "custom" ? (
              <Input label={t("fields.subscriptionCustomTermYears")} type="number" min="1" step="1" value={form.subscriptionTermYears} onChange={(event) => updateForm("subscriptionTermYears", event.target.value)} />
            ) : null}
            <div className="sm:col-span-2">
              <TextAreaField label={t("fields.comment")} value={form.comment} onChange={(value) => updateForm("comment", value)} />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <ReadingToggle
              checked={form.readingConfig.waterEnabled}
              title={t("readings.water.title")}
              description={t("readings.water.description")}
              onChange={() => toggleReading("waterEnabled")}
            />
            {form.readingConfig.waterEnabled ? (
              <div className="grid gap-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 sm:grid-cols-2">
                <Input
                  label={t("fields.hotWaterMetersPerResident")}
                  type="number"
                  min="0"
                  value={String(form.readingConfig.hotWaterMetersPerResident)}
                  onChange={(event) => updateReadingConfig("hotWaterMetersPerResident", Number(event.target.value || 0))}
                />
                <Input
                  label={t("fields.coldWaterMetersPerResident")}
                  type="number"
                  min="0"
                  value={String(form.readingConfig.coldWaterMetersPerResident)}
                  onChange={(event) => updateReadingConfig("coldWaterMetersPerResident", Number(event.target.value || 0))}
                />
              </div>
            ) : null}
            <ReadingToggle
              checked={form.readingConfig.electricityEnabled}
              title={t("readings.electricity.title")}
              description={t("readings.electricity.description")}
              onChange={() => toggleReading("electricityEnabled")}
            />
            <ReadingToggle
              checked={form.readingConfig.heatingEnabled}
              title={t("readings.heating.title")}
              description={t("readings.heating.description")}
              onChange={() => toggleReading("heatingEnabled")}
            />
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => setEditOpen(false)} disabled={loading}>
            {ui("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleUpdate()} disabled={loading}>
            {loading ? t("dialogs.edit.submitting") : s("button.update")}
          </Button>
        </div>
      </ModalShell>

      <ModalShell
        open={deleteOpen}
        onClose={() => !loading && setDeleteOpen(false)}
        title={t("dialogs.delete.title")}
        description={t("dialogs.delete.description", { building: deletingBuildingName || "—" })}
      >
        <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {t("dialogs.delete.warning")}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={() => setDeleteOpen(false)} disabled={loading}>
            {ui("cancel")}
          </Button>
          <Button type="button" variant="danger" onClick={() => void handleDelete()} disabled={loading}>
            {loading ? t("dialogs.delete.deleting") : ui("delete")}
          </Button>
        </div>
      </ModalShell>

    </>
  );
}
