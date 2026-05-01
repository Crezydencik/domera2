"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { DataTable } from "@/components/data-table";
import { SectionCard } from "@/components/section-card";
import { AlertModal } from "@/components/ui/alert-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createBuilding, deleteBuilding, getBuildingCreationAccess, updateBuilding, type BuildingMutationInput } from "@/shared/api/buildings";
import { useNotifications } from "@/shared/hooks/use-notifications";
import type { Building, BuildingReadingConfig } from "@/shared/lib/data";

type EditableBuilding = Building & {
  occupiedApartments: number;
};

type FormState = {
  name: string;
  address: string;
  apartmentsCount: string;
  readingConfig: BuildingReadingConfig;
};

type FormTab = "general" | "readings";

const EMPTY_FORM: FormState = {
  name: "",
  address: "",
  apartmentsCount: "0",
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
  const [gatingOpen, setGatingOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<FormTab>("general");
  const [gatingMessage, setGatingMessage] = useState<string | null>(null);
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

    try {
      const access = await getBuildingCreationAccess(companyId);
      if (!access.allowed) {
        setGatingMessage(access.message ?? t("gating.defaultMessage"));
        setGatingOpen(true);
        return;
      }

      resetForm();
      setCreateOpen(true);
    } catch (error) {
      notifications.error(error instanceof Error ? error.message : t("errors.creationAccessFailed"));
    }
  }

  function handleOpenEdit(building: EditableBuilding) {
    setEditingBuildingId(building.id);
    setForm({
      name: building.name,
      address: building.address,
      apartmentsCount: String(building.apartments),
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
    setDeletingBuildingId(building.id);
    setDeletingBuildingName(building.name);
    setDeleteOpen(true);
  }

  function buildPayload(): Omit<BuildingMutationInput, "companyId"> {
    const apartmentsCount = Number(form.apartmentsCount || "0");
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
      await createBuilding({ companyId, ...payload });
      notifications.success(t("feedback.created", { building: payload.name }));
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
      notifications.error(error instanceof Error ? error.message : t("errors.deleteFailed"));
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
            t("colActions"),
          ]}
          rows={rows.map((item) => [
            <div key={`${item.id}-name`}>
              <p className="font-medium text-slate-900">{item.name}</p>
            </div>,
            item.address,
            String(item.apartments),
            item.occupancy,
            <div key={`${item.id}-actions`} className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-9 w-9 px-0"
                onClick={() => handleOpenEdit(item)}
                aria-label={s("button.edit")}
                title={s("button.edit")}
              >
                <EditIcon />
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                className="h-9 w-9 px-0"
                onClick={() => handleOpenDelete(item)}
                aria-label={ui("delete")}
                title={ui("delete")}
              >
                <TrashIcon />
              </Button>
            </div>,
          ])}
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
            {loading ? t("dialogs.create.submitting") : t("dialogs.create.submit")}
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

      <AlertModal
        open={gatingOpen}
        onClose={() => setGatingOpen(false)}
        title={t("gating.title")}
        variant="warning"
        confirmLabel={ui("ok")}
      >
        <div className="space-y-3">
          <p>{gatingMessage ?? t("gating.defaultMessage")}</p>
          <p className="text-slate-400">{t("gating.futureHint")}</p>
        </div>
      </AlertModal>
    </>
  );
}