"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/ui/modal-shell";
import { PhoneInput } from "@/components/ui/phone-input";
import { createApartment, deleteApartment, importApartments, updateApartment, updateApartmentOwner } from "@/shared/api/apartments";
import { apiFetch } from "@/shared/api/client";
import { revokeInvitation } from "@/shared/api/invitations";
import { useNotifications } from "@/shared/hooks/use-notifications";
import type { BuildingReadingConfig } from "@/shared/lib/data";

export interface ManagementActionBuildingOption {
  id: string;
  label: string;
  apartmentLimit?: number;
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
  isOccupied?: boolean;
  isVacant?: boolean;
  isLocked?: boolean;
}

type InvitationRecord = {
  id: string;
  email: string;
  apartmentId?: string;
  status: string;
};
type InvitationListRow = {
  key: string;
  apartmentId: string;
  apartmentLabel: string;
  name: string;
  email: string;
  status: "occupied" | "pending" | "ready";
  invitationId?: string;
  firstName?: string;
  lastName?: string;
  contractNumber?: string;
};

type ExportFormat = "csv" | "json";
type ExportScope = "apartments" | "meterReadings" | "apartmentsAndMeterReadings";
type AddTab = "resident" | "apartment";
type RawRecord = Record<string, unknown>;
type ImportResult = {
  imported: number;
  skippedDuplicates: string[];
  errors: string[];
  createdApartments: string[];
};
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
const IMPORT_ACCEPT = ".xlsx,.csv,.json,.xml";

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

function textValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }

  return "";
}

function booleanValue(value: unknown) {
  if (value === true) return true;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";
  return false;
}

function isEmailLike(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function KebabIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <circle cx="10" cy="4" r="1.6" />
      <circle cx="10" cy="10" r="1.6" />
      <circle cx="10" cy="16" r="1.6" />
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

export function ApartmentsManagementActionsMenu({
  companyId,
  buildings,
  selectedBuildingId,
  apartments,
  apartmentRecords,
  lockedBuildingIds,
  canManage = true,
}: {
  companyId?: string;
  buildings: ManagementActionBuildingOption[];
  selectedBuildingId?: string;
  apartments: ManagementActionApartment[];
  apartmentRecords: RawRecord[];
  lockedBuildingIds?: Set<string>;
  canManage?: boolean;
}) {
  const t = useTranslations("apartments.management.menu");
  const ui = useTranslations("ui");
  const router = useRouter();
  const notifications = useNotifications();
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addTab, setAddTab] = useState<AddTab>("resident");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [invitesOpen, setInvitesOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importResultOpen, setImportResultOpen] = useState(false);
  const [importBuildingId, setImportBuildingId] = useState<string>(selectedBuildingId?.trim() ?? "");
  const [exportOpen, setExportOpen] = useState(false);
  const [loadingImport, setLoadingImport] = useState(false);
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [loadingResidentCreate, setLoadingResidentCreate] = useState(false);
  const [loadingDeleteAll, setLoadingDeleteAll] = useState(false);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [revokingInvitationId, setRevokingInvitationId] = useState<string | null>(null);
  const [loadingBulkInvites, setLoadingBulkInvites] = useState(false);
  const [loadingExport, setLoadingExport] = useState(false);
  const [invitations, setInvitations] = useState<InvitationRecord[]>([]);
  const [selectedInvitationRowKeys, setSelectedInvitationRowKeys] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [residentFirstName, setResidentFirstName] = useState("");
  const [residentLastName, setResidentLastName] = useState("");
  const [residentEmail, setResidentEmail] = useState("");
  const [residentPhone, setResidentPhone] = useState("");
  const [residentApartmentId, setResidentApartmentId] = useState("");
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
  const lockedBuildings = lockedBuildingIds ?? new Set<string>();
  const currentBuildingLocked = Boolean(effectiveBuildingId && lockedBuildings.has(effectiveBuildingId));
  const selectedScopeLocked = Boolean(selectedBuildingId?.trim() && currentBuildingLocked);

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
  const importExample = "";
  const buildingReadingConfig = effectiveBuilding?.readingConfig;
  const apartmentCountForBuilding = (buildingId: string) => apartments.filter((apartment) => apartment.buildingId === buildingId).length;
  const currentBuildingApartmentCount = effectiveBuildingId ? apartmentCountForBuilding(effectiveBuildingId) : apartments.length;
  const apartmentLimitReached = typeof effectiveBuilding?.apartmentLimit === "number"
    && currentBuildingApartmentCount >= effectiveBuilding.apartmentLimit;
  const importApartmentLimitReached = typeof importBuilding?.apartmentLimit === "number"
    && apartmentCountForBuilding(importBuilding.id) >= importBuilding.apartmentLimit;
  const apartmentLimitMessage = "Достигнут лимит квартир для этого дома. Измените дом и дождитесь подтверждения.";

  const invitationRows = useMemo<InvitationListRow[]>(() => {
    const pendingInvitationsByApartment = new Map<string, InvitationRecord>();

    for (const invitation of invitations) {
      if (invitation.status.toLowerCase() !== "pending") continue;
      if (invitation.apartmentId) pendingInvitationsByApartment.set(invitation.apartmentId, invitation);
    }

    return apartmentRecords
      .map((record, index): InvitationListRow | null => {
        const apartmentId = textValue(record.id, record.apartmentId);
        if (apartments.some((apartment) => apartment.id === apartmentId && apartment.isLocked)) return null;
        const apartmentLabel = textValue(record.number, record.apartmentNumber, record.id, record.apartmentId);
        const email = textValue(record.ownerEmail).toLowerCase();
        if (!apartmentId || !email || !isEmailLike(email)) return null;

        const firstName = textValue(record.ownerFirstName) || undefined;
        const lastName = textValue(record.ownerLastName) || undefined;
        const fallbackName = [firstName, lastName].filter(Boolean).join(" ").trim();
        const name = textValue(record.owner, fallbackName, email);
        const tenants = Array.isArray(record.tenants) ? record.tenants : [];
        const occupied =
          booleanValue(record.ownerActivated) ||
          Boolean(textValue(record.ownerAcceptedAt, record.residentId)) ||
          tenants.some((tenant) => {
            if (!tenant || typeof tenant !== "object") return false;
            const tenantRecord = tenant as Record<string, unknown>;
            const status = textValue(tenantRecord.status).toLowerCase();
            return booleanValue(tenantRecord.activated) || Boolean(textValue(tenantRecord.acceptedAt, tenantRecord.activatedAt)) || status === "active" || status === "accepted";
          });
        const pendingInvitation = pendingInvitationsByApartment.get(apartmentId);
        const invitationId = pendingInvitation?.id;
        const pending = Boolean(invitationId);

        return {
          key: `${apartmentId}-${email}-${index}`,
          apartmentId,
          apartmentLabel,
          name,
          email,
          status: occupied ? "occupied" : pending ? "pending" : "ready",
          invitationId: invitationId || undefined,
          firstName,
          lastName,
          contractNumber: textValue(record.ownerContractNumber) || undefined,
        };
      })
      .filter((row): row is InvitationListRow => Boolean(row));
  }, [apartmentRecords, apartments, invitations]);

  const readyInvitationRows = useMemo(
    () => invitationRows.filter((row) => row.status === "ready"),
    [invitationRows],
  );
  const selectedInvitationRows = useMemo(() => {
    const selectedKeys = new Set(selectedInvitationRowKeys);
    return readyInvitationRows.filter((row) => selectedKeys.has(row.key));
  }, [readyInvitationRows, selectedInvitationRowKeys]);
  const allReadyInvitationRowsSelected = readyInvitationRows.length > 0 && selectedInvitationRows.length === readyInvitationRows.length;

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
    if (importApartmentLimitReached) {
      notifications.warning(apartmentLimitMessage);
      return;
    }
    if (lockedBuildings.has(effectiveImportBuildingId)) {
      notifications.warning("This building is locked by the platform administrator.");
      return;
    }

    setLoadingImport(true);
    try {
      const response = await importApartments({ file, buildingId: effectiveImportBuildingId, companyId, fileName: file.name });
      const results = typeof response.results === "object" && response.results ? response.results as Record<string, unknown> : {};
      setImportResult({
        imported: Number(results.imported ?? 0) || 0,
        skippedDuplicates: asStringArray(results.skippedDuplicates),
        errors: asStringArray(results.errors),
        createdApartments: asStringArray(results.createdApartments),
      });
      notifications.success(t("feedback.importSuccess"));
      setImportOpen(false);
      setImportResultOpen(true);
    } catch (error) {
      notifications.error(error instanceof Error ? error.message : t("errors.importFailed"));
    } finally {
      setLoadingImport(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function openImportModal() {
    if (importApartmentLimitReached) {
      notifications.warning(apartmentLimitMessage);
      setOpen(false);
      return;
    }
    setImportBuildingId(selectedBuildingId?.trim() ?? "");
    setImportResult(null);
    setImportOpen(true);
    setOpen(false);
  }

  function closeImportResult() {
    setImportResultOpen(false);
    router.refresh();
  }

  function handleImportDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    if (loadingImport || !effectiveImportBuildingId || lockedBuildings.has(effectiveImportBuildingId) || importApartmentLimitReached) return;
    void handleImportFile(event.dataTransfer.files?.[0]);
  }

  function prepareApartmentFormDefaults() {
    setUseBuildingReadingDefaults(true);

    if (buildingReadingConfig?.waterEnabled) {
      setHotWaterMeters(String(buildingReadingConfig.hotWaterMetersPerResident ?? 1));
      setColdWaterMeters(String(buildingReadingConfig.coldWaterMetersPerResident ?? 1));
    } else {
      setHotWaterMeters("0");
      setColdWaterMeters("0");
    }
  }

  function openAddModal() {
    if (currentBuildingLocked) {
      notifications.warning("This building is locked by the platform administrator.");
      setOpen(false);
      return;
    }

    setAddTab("resident");
    prepareApartmentFormDefaults();
    setAddOpen(true);
    setOpen(false);
  }

  function openApartmentTab() {
    if (apartmentLimitReached) {
      notifications.warning(apartmentLimitMessage);
      return;
    }
    setAddTab("apartment");
    prepareApartmentFormDefaults();
  }

  async function handleCreateResident() {
    if (!companyId) {
      notifications.error(t("errors.companyMissing"));
      return;
    }

    const email = residentEmail.trim().toLowerCase();
    const firstName = residentFirstName.trim();
    const lastName = residentLastName.trim();
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

    if (!residentApartmentId) {
      notifications.warning(t("errors.residentApartmentRequired"));
      return;
    }
    if (apartments.some((apartment) => apartment.id === residentApartmentId && apartment.isLocked)) {
      notifications.warning("This apartment belongs to a locked building.");
      return;
    }
    if (!fullName) {
      notifications.warning(t("errors.residentNameRequired"));
      return;
    }
    if (!email || !isEmailLike(email)) {
      notifications.warning(t("errors.residentEmailInvalid"));
      return;
    }

    const userId = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `resident-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    setLoadingResidentCreate(true);
    try {
      await apiFetch<{ success?: boolean }>(`/users/${encodeURIComponent(userId)}/upsert`, {
        method: "POST",
        body: JSON.stringify({
          firstName,
          lastName,
          fullName,
          email,
          phone: residentPhone.trim(),
          role: "Resident",
          accountType: "Resident",
          companyId,
        }),
      });
      await updateApartment(residentApartmentId, { residentId: userId });

      notifications.success(t("feedback.residentCreated", { resident: fullName }));
      setResidentFirstName("");
      setResidentLastName("");
      setResidentEmail("");
      setResidentPhone("");
      setResidentApartmentId("");
      setAddOpen(false);
      router.refresh();
    } catch (error) {
      notifications.error(error instanceof Error ? error.message : t("errors.residentCreateFailed"));
    } finally {
      setLoadingResidentCreate(false);
    }
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
    if (lockedBuildings.has(effectiveBuildingId)) {
      notifications.warning("This building is locked by the platform administrator.");
      return;
    }
    if (apartmentLimitReached) {
      notifications.warning(apartmentLimitMessage);
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
      setAddOpen(false);
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

    const deletable = apartments.filter((apartment) => !apartment.isLocked && (apartment.isVacant ?? !apartment.isOccupied));
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
    setSelectedInvitationRowKeys([]);
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
          if (item.status.toLowerCase() !== "pending") return false;
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

  async function handleRevokeInvitation(row: InvitationListRow) {
    if (row.status !== "pending" || !row.invitationId || revokingInvitationId) return;

    setRevokingInvitationId(row.invitationId);
    try {
      await revokeInvitation(row.invitationId);
      setInvitations((items) =>
        items.filter((item) => item.id !== row.invitationId),
      );
      notifications.success(t("feedback.invitationRevoked"));
      router.refresh();
    } catch (error) {
      notifications.error(error instanceof Error ? error.message : t("errors.invitationRevokeFailed"));
    } finally {
      setRevokingInvitationId(null);
    }
  }

  function toggleInvitationRow(rowKey: string) {
    setSelectedInvitationRowKeys((current) =>
      current.includes(rowKey) ? current.filter((key) => key !== rowKey) : [...current, rowKey],
    );
  }

  function selectAllReadyInvitationRows() {
    setSelectedInvitationRowKeys(readyInvitationRows.map((row) => row.key));
  }

  function toggleAllReadyInvitationRows() {
    setSelectedInvitationRowKeys(allReadyInvitationRowsSelected ? [] : readyInvitationRows.map((row) => row.key));
  }

  async function handleSendSelectedInvitations() {
    if (loadingBulkInvites) return;
    if (!selectedInvitationRows.length) {
      notifications.info(t("feedback.noInvitationsToSend"));
      return;
    }

    setLoadingBulkInvites(true);
    let sent = 0;
    let failed = 0;

    for (const row of selectedInvitationRows) {
      try {
        await updateApartmentOwner(row.apartmentId, row.email, {
          firstName: row.firstName,
          lastName: row.lastName,
          contractNumber: row.contractNumber,
        });
        sent += 1;
      } catch {
        failed += 1;
      }
    }

    setLoadingBulkInvites(false);
    setSelectedInvitationRowKeys([]);

    if (sent > 0) {
      notifications.success(t("feedback.bulkInvitationsResult", { sent, failed }));
      setInvitesOpen(false);
      router.refresh();
      return;
    }

    notifications.error(t("errors.bulkInvitationsFailed"));
  }

  return (
    <>
      <div className="relative" ref={menuRef}>
        <input
          ref={fileInputRef}
          type="file"
          accept={IMPORT_ACCEPT}
          className="hidden"
          id="apartment-import-file"
          onChange={(event) => void handleImportFile(event.target.files?.[0])}
        />

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
          aria-label={t("openMenu")}
        >
          <KebabIcon />
        </button>

        {open && (
          <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-lg border border-slate-200 bg-white py-2 shadow-[0_18px_45px_rgba(15,23,42,0.16)]">
            <div className="px-2">
              <button type="button" onClick={() => { setExportOpen(true); setOpen(false); }} className="group flex h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition group-hover:bg-white group-hover:text-slate-800"><DownloadIcon /></span>
                <span>{t("items.export")}</span>
              </button>

              {canManage ? (
              <button
                type="button"
                onClick={openImportModal}
                disabled={loadingImport || selectedScopeLocked || importApartmentLimitReached}
                className="group flex h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-violet-700 transition hover:bg-violet-50 disabled:opacity-60"
                title={importApartmentLimitReached ? apartmentLimitMessage : undefined}
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600 transition group-hover:bg-white"><UploadIcon /></span>
                <span>{loadingImport ? t("items.importLoading") : t("items.import")}</span>
              </button>
              ) : null}

              {canManage ? (
              <button type="button" onClick={openAddModal} disabled={selectedScopeLocked} className="group flex h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:opacity-60">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition group-hover:bg-white"><PlusIcon /></span>
                <span>{t("items.add")}</span>
              </button>
              ) : null}

              {canManage ? (
              <div className="my-2 border-t border-slate-100 pt-2">
                <button type="button" onClick={() => { setDeleteOpen(true); setOpen(false); }} disabled={selectedScopeLocked} className="group flex h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-600 transition group-hover:bg-white"><TrashIcon /></span>
                  <span>{t("items.deleteAll")}</span>
                </button>
              </div>
              ) : null}

              {canManage ? (
              <button type="button" onClick={() => void openInvitations()} disabled={selectedScopeLocked} className="group flex h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-blue-700 transition hover:bg-blue-50 disabled:opacity-60">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition group-hover:bg-white"><ListIcon /></span>
                <span>{t("items.invitations")}</span>
              </button>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <ModalShell open={addOpen} onClose={() => !loadingResidentCreate && !loadingCreate && setAddOpen(false)} title={t("dialogs.add.title")} size="xl">
        <div className="space-y-5">
          <div className="grid rounded-2xl bg-slate-100 p-1 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setAddTab("resident")}
              className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                addTab === "resident" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <UserPlusIcon />
              <span>{t("items.addResident")}</span>
            </button>
            <button
              type="button"
              onClick={openApartmentTab}
              disabled={apartmentLimitReached}
              className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                addTab === "apartment" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
              } disabled:cursor-not-allowed disabled:opacity-50`}
              title={apartmentLimitReached ? apartmentLimitMessage : undefined}
            >
              <PlusIcon />
              <span>{t("items.addApartment")}</span>
            </button>
          </div>

          {addTab === "resident" ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
                  <span className="font-medium text-slate-700">{t("dialogs.createResident.fields.apartment")}</span>
                  <select
                    value={residentApartmentId}
                    onChange={(event) => setResidentApartmentId(event.target.value)}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  >
                    <option value="">{t("dialogs.createResident.fields.apartmentPlaceholder")}</option>
                    {apartments.map((apartment) => (
                      <option key={apartment.id} value={apartment.id} disabled={apartment.isLocked}>
                        #{apartment.number} {apartment.buildingId ? `- ${apartment.buildingId}` : ""}{apartment.isLocked ? " - Locked" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-slate-700">{t("dialogs.createResident.fields.firstName")}</span>
                  <input value={residentFirstName} onChange={(event) => setResidentFirstName(event.target.value)} className="rounded-2xl border border-slate-200 px-4 py-2.5 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-slate-700">{t("dialogs.createResident.fields.lastName")}</span>
                  <input value={residentLastName} onChange={(event) => setResidentLastName(event.target.value)} className="rounded-2xl border border-slate-200 px-4 py-2.5 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-slate-700">{t("dialogs.createResident.fields.email")}</span>
                  <input value={residentEmail} onChange={(event) => setResidentEmail(event.target.value)} type="email" className="rounded-2xl border border-slate-200 px-4 py-2.5 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                </label>
                <PhoneInput
                  label={t("dialogs.createResident.fields.phone")}
                  value={residentPhone}
                  onChange={(event) => setResidentPhone(event.target.value)}
                  className="rounded-2xl border-slate-200 px-4 py-2.5 focus:border-emerald-400 focus:ring-emerald-100"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setAddOpen(false)} disabled={loadingResidentCreate}>{ui("cancel")}</Button>
                <Button type="button" size="sm" onClick={() => void handleCreateResident()} disabled={loadingResidentCreate}>{loadingResidentCreate ? t("dialogs.createResident.creating") : t("dialogs.createResident.submit")}</Button>
              </div>
            </div>
          ) : (
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
                <Button type="button" variant="secondary" size="sm" onClick={() => setAddOpen(false)} disabled={loadingCreate}>{ui("cancel")}</Button>
                <Button type="button" size="sm" onClick={() => void handleCreateApartment()} disabled={loadingCreate || apartmentLimitReached}>{loadingCreate ? t("dialogs.createApartment.creating") : t("dialogs.createApartment.submit")}</Button>
              </div>
            </div>
          )}
        </div>
      </ModalShell>

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
              <p className="mt-2 font-medium text-slate-900">{t("dialogs.import.autoFormatValue")}</p>
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
                <option key={building.id} value={building.id} disabled={lockedBuildings.has(building.id)}>
                  {building.label}{lockedBuildings.has(building.id) ? " - Locked" : ""}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500">{t("dialogs.import.buildingHint")}</p>
          </div> 

          <div className="space-y-3">
            <label
              htmlFor="apartment-import-file"
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleImportDrop}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-5 py-8 text-center transition ${
                effectiveImportBuildingId && !loadingImport && !lockedBuildings.has(effectiveImportBuildingId)
                  ? "border-blue-200 bg-blue-50/60 text-blue-900 hover:border-blue-300 hover:bg-blue-50"
                  : "border-slate-200 bg-slate-50 text-slate-400"
              }`}
            >
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm">
                <UploadIcon />
              </span>
              <span className="mt-4 text-sm font-semibold text-slate-900">{t("dialogs.import.uploadTitle")}</span>
              <span className="mt-1 max-w-sm text-xs text-slate-500">{t("dialogs.import.uploadHint")}</span>
              <span className="mt-3 inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                {t("dialogs.import.allowedFiles", { formats: IMPORT_ACCEPT.replaceAll(",", ", ") })}
              </span>
            </label>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">{t("dialogs.import.structureLabel")}</p>
              <p className="mt-1 text-xs text-slate-500">{t("dialogs.import.structureHint")}</p>
            </div>

            <div className="space-y-2">
              {IMPORT_FORMATS.map((format) => (
                <details key={format} className="group rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700" open={format === "excel"}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium text-slate-900">
                    <span>{t(`dialogs.import.formats.${format}.label`)}</span>
                    <span className="text-slate-400 transition group-open:rotate-180">⌄</span>
                  </summary>
                  <p className="mt-2 text-xs text-slate-500">{t(`dialogs.import.formats.${format}.description`)}</p>
                  {format === "excel" ? (
                    <div className="mt-3 space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("dialogs.import.fieldsLabel")}</p>
                      <ul className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                        {IMPORT_FIELD_KEYS.map((fieldKey) => (
                          <li key={fieldKey}>
                            <span className="font-medium text-slate-900">{t(`dialogs.import.fields.${fieldKey}.label`)}</span>
                            <span className="text-slate-500"> - {t(`dialogs.import.fields.${fieldKey}.description`)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <pre className="mt-3 overflow-x-auto rounded-2xl bg-slate-50 px-3 py-3 font-mono text-xs leading-6 text-slate-800 whitespace-pre-wrap">
                    {String(t.raw(`dialogs.import.examples.${format}`))}
                  </pre>
                </details>
              ))}
            </div>
          </div>

          {false ? (
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
          ) : null}

          <div className="flex justify-end pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setImportOpen(false)} disabled={loadingImport}>{ui("cancel")}</Button>
          </div>
        </div>
      </ModalShell>

      <ModalShell open={importResultOpen} onClose={closeImportResult} title={t("dialogs.importResult.title")}>
        {importResult ? (
          <div className="space-y-5">
            <p className="text-sm text-slate-600">{t("dialogs.importResult.description")}</p>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm leading-7 text-emerald-900">
              <p className="font-semibold">{t("dialogs.importResult.imported", { count: importResult.imported })}</p>
              <p>{t("dialogs.importResult.duplicates", { count: importResult.skippedDuplicates.length })}</p>
              <p>{t("dialogs.importResult.errors", { count: importResult.errors.length })}</p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-900">{t("dialogs.importResult.importedApartments")}</p>
              {importResult.createdApartments.length ? (
                <div className="max-h-44 space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  {importResult.createdApartments.map((apartment, index) => (
                    <div key={`${apartment}-${index}`} className="rounded-xl bg-white px-3 py-2 text-sm text-slate-700 shadow-sm ring-1 ring-slate-200">
                      {apartment}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  {t("dialogs.importResult.emptyImported")}
                </div>
              )}
            </div>

            {importResult.skippedDuplicates.length ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-900">{t("dialogs.importResult.duplicateRows")}</p>
                <div className="max-h-32 space-y-2 overflow-y-auto rounded-2xl border border-amber-200 bg-amber-50 p-3">
                  {importResult.skippedDuplicates.map((item, index) => (
                    <div key={`${item}-${index}`} className="rounded-xl bg-white px-3 py-2 text-sm text-amber-800 shadow-sm ring-1 ring-amber-100">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {importResult.errors.length ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-900">{t("dialogs.importResult.errorRows")}</p>
                <div className="max-h-32 space-y-2 overflow-y-auto rounded-2xl border border-red-200 bg-red-50 p-3">
                  {importResult.errors.map((item, index) => (
                    <div key={`${item}-${index}`} className="rounded-xl bg-white px-3 py-2 text-sm text-red-700 shadow-sm ring-1 ring-red-100">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <Button type="button" className="w-full" onClick={closeImportResult}>{ui("ok")}</Button>
          </div>
        ) : null}
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

      <ModalShell open={invitesOpen} onClose={() => setInvitesOpen(false)} title={t("dialogs.invitations.title")} size="xl">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">{t("dialogs.invitations.description")}</p>

          {loadingInvites ? (
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">{t("dialogs.invitations.loading")}</div>
          ) : invitationRows.length ? (
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="max-h-[55vh] overflow-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-semibold text-slate-500">
                    <tr>
                      <th className="w-10 px-2 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={allReadyInvitationRowsSelected}
                          disabled={!readyInvitationRows.length || loadingBulkInvites}
                          onChange={toggleAllReadyInvitationRows}
                          aria-label={t("dialogs.invitations.columns.select")}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      </th>
                      <th className="px-4 py-3">{t("dialogs.invitations.columns.apartment")}</th>
                      <th className="px-4 py-3">{t("dialogs.invitations.columns.name")}</th>
                      <th className="px-4 py-3">{t("dialogs.invitations.columns.email")}</th>
                      <th className="px-4 py-3">{t("dialogs.invitations.columns.status")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {invitationRows.map((row) => {
                      const ready = row.status === "ready";
                      const pending = row.status === "pending";
                      const selected = selectedInvitationRowKeys.includes(row.key);

                      return (
                        <tr key={row.key} className="text-slate-700">
                          <td className="px-2 py-3 text-center align-middle">
                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={!ready || loadingBulkInvites}
                              onChange={() => toggleInvitationRow(row.key)}
                              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                            />
                          </td>
                          <td className="px-4 py-3 align-middle font-semibold text-slate-900">#{row.apartmentLabel}</td>
                          <td className="px-4 py-3 align-middle">{row.name}</td>
                          <td className="px-4 py-3 align-middle font-medium text-slate-900">{row.email}</td>
                          <td className="px-4 py-3 align-middle">
                            <div className="flex items-center gap-2">
                              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                ready
                                  ? "bg-emerald-100 text-emerald-700"
                                  : pending
                                    ? "bg-blue-100 text-blue-700"
                                    : "bg-slate-100 text-slate-600"
                              }`}>
                                {t(`dialogs.invitations.statuses.${row.status}`)}
                              </span>
                              {pending && row.invitationId ? (
                                <button
                                  type="button"
                                  onClick={() => void handleRevokeInvitation(row)}
                                  disabled={Boolean(revokingInvitationId)}
                                  className="rounded-xl border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {revokingInvitationId === row.invitationId ? t("dialogs.invitations.revoking") : t("dialogs.invitations.revoke")}
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">{t("dialogs.invitations.empty")}</div>
          )}

          <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="secondary" size="sm" onClick={selectAllReadyInvitationRows} disabled={!readyInvitationRows.length || loadingBulkInvites}>
              {t("dialogs.invitations.selectAllReady")}
            </Button>
            <div className="flex items-center justify-end gap-3">
              <span className="text-sm text-slate-500">{t("dialogs.invitations.selected", { count: selectedInvitationRows.length })}</span>
              <Button type="button" size="sm" onClick={() => void handleSendSelectedInvitations()} disabled={!selectedInvitationRows.length || loadingBulkInvites}>
                {loadingBulkInvites ? t("dialogs.invitations.sending") : t("dialogs.invitations.sendSelected")}
              </Button>
            </div>
          </div>
        </div>
      </ModalShell>
    </>
  );
}
