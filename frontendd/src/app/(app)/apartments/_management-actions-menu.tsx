"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createApartment, deleteApartment, importApartments } from "@/shared/api/apartments";
import { apiFetch } from "@/shared/api/client";
import { useNotifications } from "@/shared/hooks/use-notifications";
import type { BuildingReadingConfig } from "@/shared/lib/data";
import { ROUTES } from "@/shared/lib/routes";

export interface ManagementActionBuildingOption {
  id: string;
  label: string;
  readingConfig?: BuildingReadingConfig;
}

export interface ManagementActionApartment {
  id: string;
  number: string;
  buildingId: string;
  owner: string;
  area: string;
  declaredResidents: string;
  floor: string;
  status: string;
  residentId?: string;
}

type InvitationRecord = {
  id: string;
  email: string;
  apartmentId?: string;
  status: string;
};

type ExportFormat = "csv" | "json";
type ExportScope = "apartments" | "meterReadings" | "apartmentsAndMeterReadings";
type RawRecord = Record<string, unknown>;
type ImportFieldKey =
  | "cadastralNumber"
  | "address"
  | "cadastralPart"
  | "commonPropertyShare"
  | "owner"
  | "ownerEmail"
  | "number"
  | "floor"
  | "apartmentType"
  | "heatingArea"
  | "managementArea"
  | "declaredResidents"
  | "hotWaterMeter"
  | "coldWaterMeter"
  | "hotWaterReadings"
  | "coldWaterReadings";
type ImportFormat = (typeof IMPORT_FORMATS)[number];

const IMPORT_FIELD_KEYS: ImportFieldKey[] = [
  "cadastralNumber",
  "number",
  "address",
  "cadastralPart",
  "commonPropertyShare",
  "floor",
  "owner",
  "ownerEmail",
  "apartmentType",
  "heatingArea",
  "managementArea",
  "declaredResidents",
  "hotWaterMeter",
  "coldWaterMeter",
  "hotWaterReadings",
  "coldWaterReadings",
];

const IMPORT_FORMATS = ["excel", "json", "xml"] as const;

const IMPORT_ACCEPT_BY_FORMAT: Record<ImportFormat, string> = {
  excel: ".xlsx,.xls,.csv",
  json: ".json",
  xml: ".xml",
};

function normalizePrimitive(value: unknown): string | number | boolean | null {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return JSON.stringify(value);
}

function collectKeys(records: RawRecord[]) {
  return Array.from(
    records.reduce((keys, record) => {
      Object.keys(record).forEach((key) => keys.add(key));
      return keys;
    }, new Set<string>()),
  ).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base", numeric: true }));
}

function toCsv(records: RawRecord[]) {
  const keys = collectKeys(records);
  const lines = [keys.join(",")];

  for (const record of records) {
    lines.push(
      keys
        .map((key) => `"${String(normalizePrimitive(record[key]) ?? "").replaceAll('"', '""')}"`)
        .join(","),
    );
  }

  return lines.join("\n");
}

function downloadBlob(content: BlobPart, type: string, fileName: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function KebabIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <circle cx="4" cy="10" r="1.6" />
      <circle cx="10" cy="10" r="1.6" />
      <circle cx="16" cy="10" r="1.6" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M10 3.75v8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m6.75 9.75 3.25 3.25 3.25-3.25" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 15.75h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M10 16.25V7.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m13.25 10.25-3.25-3.25-3.25 3.25" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 16.25h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function UserPlusIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M8 10a2.75 2.75 0 1 0 0-5.5A2.75 2.75 0 0 0 8 10Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.75 15.5a4.25 4.25 0 0 1 8.5 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M14.5 6.25v5.5M11.75 9h5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M10 4.25v11.5M4.25 10h11.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M5.75 6.5h8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 4.75h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7 7.25v6.25M10 7.25v6.25M13 7.25v6.25" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M6.25 6.5l.35 8.07A1.5 1.5 0 0 0 8.1 16h3.8a1.5 1.5 0 0 0 1.5-1.43l.35-8.07" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <rect x="4" y="4.5" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M7 8h6M7 11h6M7 14h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ModalShell({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex min-h-full items-center justify-center">
        <div
          role="dialog"
          aria-modal="true"
          className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            ×
          </button>
          <h3 className="mb-4 shrink-0 pr-8 text-lg font-semibold text-slate-900">{title}</h3>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function ApartmentsManagementActionsMenu({
  companyId,
  buildings,
  selectedBuildingId,
  apartments,
  apartmentRecords,
}: {
  companyId?: string;
  buildings: ManagementActionBuildingOption[];
  selectedBuildingId?: string;
  apartments: ManagementActionApartment[];
  apartmentRecords: RawRecord[];
}) {
  const t = useTranslations("apartments.management.menu");
  const ui = useTranslations("ui");
  const router = useRouter();
  const notifications = useNotifications();
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [invitesOpen, setInvitesOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importBuildingId, setImportBuildingId] = useState<string>(selectedBuildingId?.trim() ?? "");
  const [importFormat, setImportFormat] = useState<ImportFormat>("excel");
  const [exportOpen, setExportOpen] = useState(false);
  const [loadingImport, setLoadingImport] = useState(false);
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [loadingDeleteAll, setLoadingDeleteAll] = useState(false);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [loadingExport, setLoadingExport] = useState(false);
  const [invitations, setInvitations] = useState<InvitationRecord[]>([]);
  const [apartmentNumber, setApartmentNumber] = useState("");
  const [floor, setFloor] = useState("");
  const [area, setArea] = useState("");
  const [declaredResidents, setDeclaredResidents] = useState("");
  const [useBuildingReadingDefaults, setUseBuildingReadingDefaults] = useState(true);
  const [hotWaterMeters, setHotWaterMeters] = useState("1");
  const [coldWaterMeters, setColdWaterMeters] = useState("1");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("json");
  const [exportScope, setExportScope] = useState<ExportScope>("apartments");

  const effectiveBuildingId = useMemo(() => {
    if (selectedBuildingId?.trim()) return selectedBuildingId.trim();
    return buildings.length === 1 ? buildings[0].id : undefined;
  }, [buildings, selectedBuildingId]);

  const apartmentLabelById = useMemo(
    () => new Map(apartments.map((apartment) => [apartment.id, apartment.number])),
    [apartments],
  );

  const effectiveBuilding = useMemo(
    () => buildings.find((building) => building.id === effectiveBuildingId),
    [buildings, effectiveBuildingId],
  );
  const effectiveImportBuildingId = importBuildingId.trim() || effectiveBuildingId || "";
  const importBuilding = useMemo(
    () => buildings.find((building) => building.id === effectiveImportBuildingId),
    [buildings, effectiveImportBuildingId],
  );
  const importBuildingLabel = importBuilding?.label;
  const importAccept = IMPORT_ACCEPT_BY_FORMAT[importFormat];
  const isStructuredImportFormat = importFormat === "json" || importFormat === "xml";
  const importExample = String(t.raw(`dialogs.import.examples.${importFormat}`));
  const buildingReadingConfig = effectiveBuilding?.readingConfig;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleImportFile(file: File | undefined) {
    if (!file) return;
    if (!companyId) {
      notifications.error(t("errors.companyMissing"));
      return;
    }
    if (!effectiveImportBuildingId) {
      notifications.warning(t("errors.chooseBuildingFirst"));
      return;
    }

    setLoadingImport(true);
    try {
      await importApartments({ file, buildingId: effectiveImportBuildingId, companyId, fileName: file.name });
      notifications.success(t("feedback.importSuccess"));
      setImportOpen(false);
      router.refresh();
    } catch (error) {
      notifications.error(error instanceof Error ? error.message : t("errors.importFailed"));
    } finally {
      setLoadingImport(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function openImportModal() {
    setImportBuildingId(selectedBuildingId?.trim() ?? "");
    setImportFormat("excel");
    setImportOpen(true);
    setOpen(false);
  }

  function openCreateApartmentModal() {
    setUseBuildingReadingDefaults(true);

    if (buildingReadingConfig?.waterEnabled) {
      setHotWaterMeters(String(buildingReadingConfig.hotWaterMetersPerResident ?? 1));
      setColdWaterMeters(String(buildingReadingConfig.coldWaterMetersPerResident ?? 1));
    } else {
      setHotWaterMeters("0");
      setColdWaterMeters("0");
    }

    setCreateOpen(true);
    setOpen(false);
  }

  async function fetchMeterReadingsForExport() {
    if (!companyId) {
      throw new Error(t("errors.companyMissing"));
    }

    const response = await apiFetch<{ items?: RawRecord[] }>(`/meter-readings?companyId=${encodeURIComponent(companyId)}`);
    const items = Array.isArray(response.items) ? response.items : [];
    const visibleApartmentIds = new Set(
      apartmentRecords
        .map((record) => (typeof record.id === "string" && record.id.trim() ? record.id.trim() : undefined))
        .filter((value): value is string => Boolean(value)),
    );

    if (!visibleApartmentIds.size) {
      return items;
    }

    return items.filter((item) => {
      const apartmentId = typeof item.apartmentId === "string" ? item.apartmentId.trim() : "";
      return apartmentId ? visibleApartmentIds.has(apartmentId) : true;
    });
  }

  async function handleExport() {
    if (!apartmentRecords.length && exportScope !== "meterReadings") {
      notifications.info(t("feedback.nothingToExport"));
      setExportOpen(false);
      return;
    }

    setLoadingExport(true);

    try {
      const exportPayload: Record<string, unknown> = {
        exportedAt: new Date().toISOString(),
        scope: exportScope,
        format: exportFormat,
      };

      const apartmentsData = apartmentRecords.map((record) => ({ ...record }));
      const meterReadingsData =
        exportScope === "apartments"
          ? []
          : await fetchMeterReadingsForExport();

      if (exportScope === "apartments" || exportScope === "apartmentsAndMeterReadings") {
        exportPayload.apartments = apartmentsData;
      }
      if (exportScope === "meterReadings" || exportScope === "apartmentsAndMeterReadings") {
        exportPayload.meterReadings = meterReadingsData;
      }

      if (exportFormat === "json") {
        downloadBlob(
          JSON.stringify(exportPayload, null, 2),
          "application/json;charset=utf-8;",
          `domera-export-${exportScope}.json`,
        );
      } else if (exportScope === "apartmentsAndMeterReadings") {
        const apartmentsCsv = toCsv(apartmentsData);
        const meterReadingsCsv = toCsv(meterReadingsData);
        downloadBlob(
          `# apartments\n${apartmentsCsv}\n\n# meterReadings\n${meterReadingsCsv}`,
          "text/csv;charset=utf-8;",
          "domera-export-apartments-and-meter-readings.csv",
        );
      } else {
        const records = exportScope === "apartments" ? apartmentsData : meterReadingsData;
        downloadBlob(
          toCsv(records),
          "text/csv;charset=utf-8;",
          `domera-export-${exportScope}.csv`,
        );
      }

      notifications.success(t("feedback.exportSuccess"));
      setExportOpen(false);
    } catch (error) {
      notifications.error(error instanceof Error ? error.message : t("errors.exportFailed"));
    } finally {
      setLoadingExport(false);
      setOpen(false);
    }
  }

  async function handleCreateApartment() {
    if (!companyId) {
      notifications.error(t("errors.companyMissing"));
      return;
    }
    if (!effectiveBuildingId) {
      notifications.warning(t("errors.chooseBuildingFirst"));
      return;
    }
    if (!apartmentNumber.trim()) {
      notifications.warning(t("errors.apartmentNumberRequired"));
      return;
    }
    if (!useBuildingReadingDefaults && buildingReadingConfig?.waterEnabled) {
      const hot = Number(hotWaterMeters || "0");
      const cold = Number(coldWaterMeters || "0");
      if (!Number.isFinite(hot) || hot < 0) {
        notifications.warning(t("errors.hotWaterMetersInvalid"));
        return;
      }
      if (!Number.isFinite(cold) || cold < 0) {
        notifications.warning(t("errors.coldWaterMetersInvalid"));
        return;
      }
    }

    setLoadingCreate(true);
    try {
      await createApartment({
        number: apartmentNumber.trim(),
        buildingId: effectiveBuildingId,
        companyId,
        ...(floor.trim() ? { floor: Number(floor) } : {}),
        ...(area.trim() ? { area: Number(area) } : {}),
        ...(declaredResidents.trim() ? { declaredResidents: Number(declaredResidents) } : {}),
        ...(buildingReadingConfig?.waterEnabled
          ? {
              readingConfigOverride: {
                useBuildingDefaults: useBuildingReadingDefaults,
                hotWaterMeters: useBuildingReadingDefaults ? 0 : Math.trunc(Number(hotWaterMeters || "0") || 0),
                coldWaterMeters: useBuildingReadingDefaults ? 0 : Math.trunc(Number(coldWaterMeters || "0") || 0),
              },
            }
          : {}),
      });
      notifications.success(t("feedback.apartmentCreated", { apartment: apartmentNumber.trim() }));
      setApartmentNumber("");
      setFloor("");
      setArea("");
      setDeclaredResidents("");
      setUseBuildingReadingDefaults(true);
      setCreateOpen(false);
      router.refresh();
    } catch (error) {
      notifications.error(error instanceof Error ? error.message : t("errors.createFailed"));
    } finally {
      setLoadingCreate(false);
    }
  }

  async function handleDeleteAll() {
    const scopeRequiresBuilding = buildings.length > 1 && !selectedBuildingId;
    if (scopeRequiresBuilding) {
      notifications.warning(t("errors.chooseBuildingForDelete"));
      return;
    }

    const deletable = apartments.filter((apartment) => !apartment.residentId);
    if (deletable.length === 0) {
      notifications.info(t("feedback.noVacantApartmentsToDelete"));
      setDeleteOpen(false);
      return;
    }

    setLoadingDeleteAll(true);
    try {
      for (const apartment of deletable) {
        await deleteApartment(apartment.id);
      }

      const skipped = apartments.length - deletable.length;
      notifications.success(t("feedback.bulkDeleteSuccess", { deleted: deletable.length, skipped }));
      setDeleteOpen(false);
      router.refresh();
    } catch (error) {
      notifications.error(error instanceof Error ? error.message : t("errors.bulkDeleteFailed"));
    } finally {
      setLoadingDeleteAll(false);
    }
  }

  async function openInvitations() {
    if (!companyId) {
      notifications.error(t("errors.companyMissing"));
      return;
    }

    setLoadingInvites(true);
    setInvitesOpen(true);
    setOpen(false);

    try {
      const response = await apiFetch<{ items?: Record<string, unknown>[] }>(`/invitations?companyId=${encodeURIComponent(companyId)}`);
      const items = Array.isArray(response.items) ? response.items : [];
      const filtered = items
        .map((item) => ({
          id: String(item.id ?? "—"),
          email: String(item.email ?? "—"),
          apartmentId: typeof item.apartmentId === "string" ? item.apartmentId : undefined,
          status: String(item.status ?? "pending"),
        }))
        .filter((item) => {
          if (!selectedBuildingId || !item.apartmentId) return true;
          return apartments.some((apartment) => apartment.id === item.apartmentId && apartment.buildingId === selectedBuildingId);
        });
      setInvitations(filtered);
    } catch (error) {
      notifications.error(error instanceof Error ? error.message : t("errors.invitationsLoadFailed"));
      setInvitations([]);
    } finally {
      setLoadingInvites(false);
    }
  }

  return (
    <>
      <div className="relative" ref={menuRef}>
        <input
          ref={fileInputRef}
          type="file"
          accept={importAccept}
          className="hidden"
          onChange={(event) => void handleImportFile(event.target.files?.[0])}
        />

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
          aria-label={t("openMenu")}
        >
          <KebabIcon />
        </button>

        {open && (
          <div className="absolute right-0 z-30 mt-3 w-72 rounded-3xl border border-slate-900 bg-white p-3 shadow-2xl">
            <div className="space-y-1.5">
              <button type="button" onClick={() => { setExportOpen(true); setOpen(false); }} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-slate-700 transition hover:bg-slate-50">
                <span className="text-slate-500"><DownloadIcon /></span>
                <span>{t("items.export")}</span>
              </button>

              <button
                type="button"
                onClick={openImportModal}
                disabled={loadingImport}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-violet-600 transition hover:bg-violet-50 disabled:opacity-60"
              >
                <span><UploadIcon /></span>
                <span>{loadingImport ? t("items.importLoading") : t("items.import")}</span>
              </button>

              <Link href={ROUTES.residents} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-emerald-600 transition hover:bg-emerald-50">
                <span><UserPlusIcon /></span>
                <span>{t("items.addResident")}</span>
              </Link>

              <button type="button" onClick={openCreateApartmentModal} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-slate-800 transition hover:bg-slate-50">
                <span><PlusIcon /></span>
                <span>{t("items.addApartment")}</span>
              </button>

              <button type="button" onClick={() => { setDeleteOpen(true); setOpen(false); }} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-red-600 transition hover:bg-red-50">
                <span><TrashIcon /></span>
                <span>{t("items.deleteAll")}</span>
              </button>

              <button type="button" onClick={() => void openInvitations()} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-blue-600 transition hover:bg-blue-50">
                <span><ListIcon /></span>
                <span>{t("items.invitations")}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <ModalShell open={exportOpen} onClose={() => !loadingExport && setExportOpen(false)} title={t("dialogs.export.title")}>
        <div className="space-y-5">
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p className="font-medium text-slate-900">{t("dialogs.export.description")}</p>
            <p className="mt-1 text-xs text-slate-500">{t("dialogs.export.hint")}</p>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-900">{t("dialogs.export.formatLabel")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(["json", "csv"] as const).map((format) => (
                <label key={format} className={`cursor-pointer rounded-2xl border px-4 py-3 text-sm transition ${exportFormat === format ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
                  <input type="radio" name="export-format" value={format} checked={exportFormat === format} onChange={() => setExportFormat(format)} className="sr-only" />
                  <span className="font-medium">{t(`dialogs.export.formats.${format}.label`)}</span>
                  <span className="mt-1 block text-xs text-slate-500">{t(`dialogs.export.formats.${format}.description`)}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-900">{t("dialogs.export.scopeLabel")}</p>
            <div className="space-y-2">
              {(["apartments", "meterReadings", "apartmentsAndMeterReadings"] as const).map((scope) => (
                <label key={scope} className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 text-sm transition ${exportScope === scope ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
                  <input type="radio" name="export-scope" value={scope} checked={exportScope === scope} onChange={() => setExportScope(scope)} className="mt-0.5" />
                  <span>
                    <span className="block font-medium">{t(`dialogs.export.scopes.${scope}.label`)}</span>
                    <span className="mt-1 block text-xs text-slate-500">{t(`dialogs.export.scopes.${scope}.description`)}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setExportOpen(false)} disabled={loadingExport}>{ui("cancel")}</Button>
            <Button type="button" size="sm" onClick={() => void handleExport()} disabled={loadingExport}>{loadingExport ? t("dialogs.export.exporting") : t("dialogs.export.submit")}</Button>
          </div>
        </div>
      </ModalShell>

      <ModalShell open={importOpen} onClose={() => !loadingImport && setImportOpen(false)} title={t("dialogs.import.title")}>
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t("dialogs.import.summaryBuildingLabel")}</p>
              <p className="mt-2 font-medium text-slate-900">{importBuildingLabel ?? t("dialogs.import.summaryNotSelected")}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t("dialogs.import.summaryFormatLabel")}</p>
              <p className="mt-2 font-medium text-slate-900">{t(`dialogs.import.formats.${importFormat}.label`)}</p>
            </div>
          </div>

          <div className={`rounded-2xl border px-4 py-3 text-sm ${importBuildingLabel ? "border-emerald-100 bg-emerald-50 text-emerald-900" : "border-amber-100 bg-amber-50 text-amber-900"}`}>
            <p className="font-medium">
              {importBuildingLabel
                ? t("dialogs.import.selectedBuilding", { building: importBuildingLabel })
                : t("dialogs.import.selectBuildingFirst")}
            </p>
            <p className={`mt-1 text-xs ${importBuildingLabel ? "text-emerald-700" : "text-amber-700"}`}>
              {t("dialogs.import.selectionHint")}
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="import-building" className="text-sm font-semibold text-slate-900">
              {t("dialogs.import.buildingLabel")}
            </label>
            <select
              id="import-building"
              value={importBuildingId}
              onChange={(event) => setImportBuildingId(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition hover:border-slate-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              disabled={loadingImport}
            >
              <option value="">{t("dialogs.import.buildingPlaceholder")}</option>
              {buildings.map((building) => (
                <option key={building.id} value={building.id}>
                  {building.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500">{t("dialogs.import.buildingHint")}</p>
          </div> 

          <div className="space-y-3">
            <label htmlFor="import-format" className="text-sm font-semibold text-slate-900">
              {t("dialogs.import.formatLabel")}
            </label>
            <select
              id="import-format"
              value={importFormat}
              onChange={(event) => setImportFormat(event.target.value as ImportFormat)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition hover:border-slate-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              disabled={loadingImport}
            >
              {IMPORT_FORMATS.map((format) => (
                <option key={format} value={format}>
                  {t(`dialogs.import.formats.${format}.label`)}
                </option>
              ))}
            </select>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
              <p className="font-medium text-slate-900">{t(`dialogs.import.formats.${importFormat}.label`)}</p>
              <p className="mt-1 text-xs text-slate-500">{t(`dialogs.import.formats.${importFormat}.description`)}</p>
              <p className="mt-3 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                {t("dialogs.import.allowedFiles", { formats: importAccept.replaceAll(",", ", ") })}
              </p>
            </div>
          </div>

          {isStructuredImportFormat ? (
            <>
              <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                <p className="font-medium text-blue-950">{t("dialogs.import.structureLabel")}</p>
                <p className="mt-1 text-xs text-blue-800">{t("dialogs.import.structureHint")}</p>
                <pre className="mt-3 overflow-x-auto rounded-2xl bg-white/80 px-3 py-3 font-mono text-xs leading-6 text-blue-950 whitespace-pre-wrap">
                  {importExample}
                </pre>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-900">{t("dialogs.import.fieldsLabel")}</p>
                <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700 marker:text-slate-400">
                  {IMPORT_FIELD_KEYS.map((fieldKey) => (
                    <li key={fieldKey}>
                      <span className="font-medium text-slate-900">{t(`dialogs.import.fields.${fieldKey}.label`)}</span>
                      <span className="text-slate-500"> — {t(`dialogs.import.fields.${fieldKey}.description`)}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                <p className="font-medium">{t("dialogs.import.examples.title")}</p>
                <pre className="mt-2 overflow-x-auto rounded-2xl bg-white/80 px-3 py-3 font-mono text-xs leading-6 text-blue-950 whitespace-pre-wrap">
                  {importExample}
                </pre>
              </div>
            </>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setImportOpen(false)} disabled={loadingImport}>{ui("cancel")}</Button>
            <Button type="button" size="sm" onClick={() => fileInputRef.current?.click()} disabled={loadingImport || !effectiveImportBuildingId}>
              {loadingImport ? t("items.importLoading") : t("dialogs.import.submit")}
            </Button>
          </div>
        </div>
      </ModalShell>

      <ModalShell open={createOpen} onClose={() => !loadingCreate && setCreateOpen(false)} title={t("dialogs.createApartment.title")}>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-slate-700">{t("dialogs.createApartment.fields.number")}</span>
              <input value={apartmentNumber} onChange={(event) => setApartmentNumber(event.target.value)} className="rounded-2xl border border-slate-200 px-4 py-2.5 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-slate-700">{t("dialogs.createApartment.fields.floor")}</span>
              <input value={floor} onChange={(event) => setFloor(event.target.value)} inputMode="numeric" className="rounded-2xl border border-slate-200 px-4 py-2.5 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-slate-700">{t("dialogs.createApartment.fields.area")}</span>
              <input value={area} onChange={(event) => setArea(event.target.value)} inputMode="decimal" className="rounded-2xl border border-slate-200 px-4 py-2.5 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-slate-700">{t("dialogs.createApartment.fields.declaredResidents")}</span>
              <input value={declaredResidents} onChange={(event) => setDeclaredResidents(event.target.value)} inputMode="numeric" className="rounded-2xl border border-slate-200 px-4 py-2.5 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
            </label>
          </div>

          {buildingReadingConfig?.waterEnabled ? (
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">{t("dialogs.createApartment.readings.title")}</p>
                <p className="mt-1 text-sm text-slate-500">{t("dialogs.createApartment.readings.description")}</p>
              </div>

              <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={useBuildingReadingDefaults}
                  onChange={(event) => setUseBuildingReadingDefaults(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>
                  <span className="block font-medium text-slate-900">{t("dialogs.createApartment.readings.useBuildingDefaults")}</span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {t("dialogs.createApartment.readings.buildingDefaultsHint", {
                      hot: buildingReadingConfig.hotWaterMetersPerResident,
                      cold: buildingReadingConfig.coldWaterMetersPerResident,
                    })}
                  </span>
                </span>
              </label>

              {!useBuildingReadingDefaults ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="font-medium text-slate-700">{t("dialogs.createApartment.readings.hotWaterMeters")}</span>
                    <input value={hotWaterMeters} onChange={(event) => setHotWaterMeters(event.target.value)} inputMode="numeric" className="rounded-2xl border border-slate-200 px-4 py-2.5 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="font-medium text-slate-700">{t("dialogs.createApartment.readings.coldWaterMeters")}</span>
                    <input value={coldWaterMeters} onChange={(event) => setColdWaterMeters(event.target.value)} inputMode="numeric" className="rounded-2xl border border-slate-200 px-4 py-2.5 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                  </label>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setCreateOpen(false)} disabled={loadingCreate}>{ui("cancel")}</Button>
            <Button type="button" size="sm" onClick={() => void handleCreateApartment()} disabled={loadingCreate}>{loadingCreate ? t("dialogs.createApartment.creating") : t("dialogs.createApartment.submit")}</Button>
          </div>
        </div>
      </ModalShell>

      <ModalShell open={deleteOpen} onClose={() => !loadingDeleteAll && setDeleteOpen(false)} title={t("dialogs.deleteAll.title")}>
        <div className="space-y-4 text-sm text-slate-600">
          <p>{t("dialogs.deleteAll.description")}</p>
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p>{t("dialogs.deleteAll.scope", { count: apartments.length })}</p>
            <p className="mt-1 text-xs text-slate-500">{t("dialogs.deleteAll.hint")}</p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setDeleteOpen(false)} disabled={loadingDeleteAll}>{ui("cancel")}</Button>
            <Button type="button" variant="danger" size="sm" onClick={() => void handleDeleteAll()} disabled={loadingDeleteAll}>{loadingDeleteAll ? t("dialogs.deleteAll.deleting") : t("items.deleteAll")}</Button>
          </div>
        </div>
      </ModalShell>

      <ModalShell open={invitesOpen} onClose={() => setInvitesOpen(false)} title={t("dialogs.invitations.title")}>
        {loadingInvites ? (
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">{t("dialogs.invitations.loading")}</div>
        ) : invitations.length ? (
          <div className="space-y-2">
            {invitations.map((invitation) => (
              <div key={invitation.id} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">{invitation.email}</p>
                    <p className="mt-1 text-slate-500">
                      {t("dialogs.invitations.apartment", { apartment: invitation.apartmentId ? apartmentLabelById.get(invitation.apartmentId) ?? invitation.apartmentId : "—" })}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-slate-600">{invitation.status}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">{t("dialogs.invitations.empty")}</div>
        )}
      </ModalShell>
    </>
  );
}