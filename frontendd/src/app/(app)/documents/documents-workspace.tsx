"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  FiCheck,
  FiDownload,
  FiFileText,
  FiHome,
  FiLock,
  FiPlus,
  FiSearch,
  FiShield,
  FiTrash2,
  FiUploadCloud,
  FiUsers,
} from "react-icons/fi";
import { DocumentViewerButton } from "@/components/document-viewer-button";
import { AlertModal } from "@/components/ui/alert-modal";
import { Modal } from "@/components/ui/modal";
import {
  deleteDocument,
  getDocuments,
  updateDocumentAccess,
  uploadDocument,
  type DocumentRecord,
  type DocumentScope,
} from "@/shared/api/documents";
import { useNotifications } from "@/shared/hooks/use-notifications";
import { isApprovedBuilding } from "@/shared/lib/buildings";
import type { Building, DocumentItem } from "@/shared/lib/data";
import type { DashboardRole } from "@/shared/role-ui";

type RawRecord = Record<string, unknown>;

type StoredDocument = {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  scope: DocumentScope;
  buildingId?: string;
  buildingName?: string;
  apartmentId?: string;
  apartmentLabel?: string;
  ownerUserId?: string;
  uploaderRole?: string;
  downloadUrl?: string;
};

type ApartmentOption = {
  id: string;
  label: string;
  buildingId?: string;
  buildingName?: string;
};

type ArchiveTab = "all" | "management" | "personal" | "apartments" | "shared" | "internalArchive" | "openAccess";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }

  return "";
}

function formatBytes(size: number) {
  if (!size) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let index = 0;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatStableDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "-";

  const pad = (part: number) => String(part).padStart(2, "0");
  return `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}.${date.getUTCFullYear()}`;
}

function toApartmentOption(item: RawRecord, fallbackLabel: string, shortPrefix: string): ApartmentOption {
  const id = firstString(item.id, item.apartmentId);
  const apartmentNumber = firstString(item.number, item.apartmentNumber, item.apartmentNo, item.flatNumber);
  const buildingName = firstString(item.buildingName, item.building, item.address);

  return {
    id,
    label: apartmentNumber
      ? buildingName ? `${buildingName}, ${shortPrefix} ${apartmentNumber}` : `${shortPrefix} ${apartmentNumber}`
      : buildingName || fallbackLabel,
    buildingId: firstString(item.buildingId),
    buildingName,
  };
}

function isApartmentScopedDocument(document: StoredDocument) {
  return Boolean(document.apartmentId) ||
    document.scope === "apartmentResidents" ||
    document.scope === "apartmentPrivate" ||
    document.scope === "privateApartment";
}

function isOwnManagementArchiveDocument(document: StoredDocument, userId?: string) {
  return document.scope === "managementArchive" && Boolean(userId) && document.ownerUserId === userId;
}

function isBuildingScopedDocument(document: StoredDocument) {
  return Boolean(document.buildingId) &&
    !isApartmentScopedDocument(document) &&
    (document.scope === "buildingResidents" || document.scope === "managementArchive");
}

function canSeeDocument(
  document: StoredDocument,
  role: DashboardRole,
  userId?: string,
  managementCompanyVisibilityOnly = false,
  buildingDocumentsOnly = false,
) {
  if (buildingDocumentsOnly && !isBuildingScopedDocument(document) && !isOwnManagementArchiveDocument(document, userId)) {
    return false;
  }

  if (managementCompanyVisibilityOnly) {
    return (
      document.ownerUserId === userId &&
      (document.scope === "managementArchive" || document.scope === "platformPrivate")
    );
  }

  if (document.scope === "platformPrivate") {
    return document.ownerUserId === userId;
  }

  if (document.scope === "apartmentPrivate") {
    return role !== "managementCompany";
  }

  if (document.scope === "privateApartment") {
    return role !== "managementCompany" && (!document.ownerUserId || document.ownerUserId === userId);
  }

  if (document.scope === "managementArchive") {
    return role === "managementCompany";
  }

  return true;
}

function getScopeIcon(scope: DocumentScope) {
  if (scope === "platformPrivate") return <FiLock className="h-4 w-4" />;
  if (scope === "privateApartment") return <FiLock className="h-4 w-4" />;
  if (scope === "apartmentPrivate") return <FiHome className="h-4 w-4" />;
  if (scope === "managementArchive") return <FiShield className="h-4 w-4" />;
  if (scope === "apartmentResidents") return <FiHome className="h-4 w-4" />;
  return <FiUsers className="h-4 w-4" />;
}

function getScopeLabel(
  scope: DocumentScope,
  role: DashboardRole,
  labels: Record<DocumentScope, string>,
  shareWithManagementLabel: string,
) {
  if (scope === "managementArchive" && role !== "managementCompany") {
    return shareWithManagementLabel;
  }

  return labels[scope];
}

function toStoredServerDocument(item: DocumentItem): StoredDocument {
  return {
    id: item.id,
    title: item.title,
    fileName: `${item.title}.pdf`,
    mimeType: "application/pdf",
    size: 0,
    uploadedAt: item.updatedAt,
    scope: item.target.toLowerCase().includes("resident") ? "buildingResidents" : "managementArchive",
    buildingName: item.target,
    uploaderRole: "ManagementCompany",
  };
}

function toStoredDocument(item: DocumentRecord): StoredDocument {
  return {
    id: item.id,
    title: item.title,
    fileName: item.fileName,
    mimeType: item.mimeType,
    size: item.size,
    uploadedAt: item.uploadedAt,
    scope: item.scope,
    buildingId: item.buildingId,
    buildingName: item.buildingName,
    apartmentId: item.apartmentId,
    apartmentLabel: item.apartmentLabel,
    ownerUserId: item.ownerUserId,
    uploaderRole: item.uploaderRole,
    downloadUrl: item.downloadUrl,
  };
}

function buildDownloadHref(item: StoredDocument) {
  if (!item.downloadUrl) return "";
  if (item.downloadUrl.startsWith("http://") || item.downloadUrl.startsWith("https://")) {
    return item.downloadUrl;
  }

  return `${apiBaseUrl}${item.downloadUrl}`;
}

export function DocumentsWorkspace({
  role,
  userId,
  buildings,
  apartments,
  serverDocuments,
  managementCompanyVisibilityOnly = false,
  buildingDocumentsOnly = false,
}: {
  role: DashboardRole;
  userId?: string;
  buildings: Building[];
  apartments: RawRecord[];
  serverDocuments: DocumentItem[];
  managementCompanyVisibilityOnly?: boolean;
  buildingDocumentsOnly?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations("documents");
  const notifications = useNotifications();
  const effectiveUserId = userId;
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<ArchiveTab>("all");
  const [archiveBuildingId, setArchiveBuildingId] = useState("");
  const [archiveApartmentId, setArchiveApartmentId] = useState("");
  const [updatingAccessId, setUpdatingAccessId] = useState<string | null>(null);
  const [editingAccessDocument, setEditingAccessDocument] = useState<StoredDocument | null>(null);
  const [accessDraftScope, setAccessDraftScope] = useState<DocumentScope>(
    managementCompanyVisibilityOnly ? "platformPrivate" : "buildingResidents",
  );
  const [accessDraftApartmentId, setAccessDraftApartmentId] = useState("");
  const [scope, setScope] = useState<DocumentScope>(
    managementCompanyVisibilityOnly ? "platformPrivate" : role === "managementCompany" ? "buildingResidents" : "apartmentPrivate",
  );
  const [buildingId, setBuildingId] = useState("");
  const [apartmentId, setApartmentId] = useState("");
  const [title, setTitle] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<StoredDocument | null>(null);

  const buildingOptions = useMemo(
    () => buildings.filter((building) => building.id && isApprovedBuilding(building)),
    [buildings],
  );
  const apartmentOptions = useMemo(
    () => apartments.map((item) => toApartmentOption(item, t("fallbacks.apartment"), t("fallbacks.apartmentShort"))).filter((item) => item.id),
    [apartments, t],
  );
  const translatedScopeLabels = useMemo<Record<DocumentScope, string>>(() => ({
    buildingResidents: t("scopes.buildingResidents.label"),
    apartmentResidents: t("scopes.apartmentResidents.label"),
    apartmentPrivate: t("scopes.apartmentPrivate.label"),
    privateApartment: t("scopes.privateApartment.label"),
    platformPrivate: t("scopes.platformPrivate.label"),
    managementArchive: t("scopes.managementArchive.label"),
  }), [t]);
  const translatedScopeDescriptions = useMemo<Record<DocumentScope, string>>(() => ({
    buildingResidents: t("scopes.buildingResidents.description"),
    apartmentResidents: t("scopes.apartmentResidents.description"),
    apartmentPrivate: t("scopes.apartmentPrivate.description"),
    privateApartment: t("scopes.privateApartment.description"),
    platformPrivate: t("scopes.platformPrivate.description"),
    managementArchive: t("scopes.managementArchive.description"),
  }), [t]);
  const shareWithManagementLabel = t("scopes.managementArchive.shareLabel");
  const hasMultipleApartmentOptions = apartmentOptions.length > 1;
  const selectedApartment = useMemo(
    () => apartmentOptions.find((apartment) => apartment.id === apartmentId),
    [apartmentId, apartmentOptions],
  );
  const archiveApartmentOptions = useMemo(() => {
    if (role !== "managementCompany" || !archiveBuildingId) return apartmentOptions;
    return apartmentOptions.filter((apartment) => apartment.buildingId === archiveBuildingId);
  }, [apartmentOptions, archiveBuildingId, role]);
  const hasMultipleArchiveApartmentOptions = archiveApartmentOptions.length > 1;
  const archiveBuildingOptions = useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>();

    for (const building of buildingOptions) {
      byId.set(building.id, {
        id: building.id,
        name: building.address && building.address !== "—" ? building.address : building.name,
      });
    }

    for (const apartment of apartmentOptions) {
      if (!apartment.buildingId || byId.has(apartment.buildingId)) continue;
      byId.set(apartment.buildingId, {
        id: apartment.buildingId,
        name: apartment.buildingName || apartment.buildingId,
      });
    }

    return Array.from(byId.values())
      .filter((building) => building.id)
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" }));
  }, [apartmentOptions, buildingOptions]);
  const selectedArchiveApartment = useMemo(
    () => apartmentOptions.find((apartment) => apartment.id === archiveApartmentId),
    [apartmentOptions, archiveApartmentId],
  );

  const canUseBuildingResidents = !managementCompanyVisibilityOnly && role === "managementCompany";
  const canShareWithManagement = managementCompanyVisibilityOnly || role !== "managementCompany";
  const canUseManagementArchive = !managementCompanyVisibilityOnly && role === "managementCompany";
  const canUsePrivateApartment = !buildingDocumentsOnly && !managementCompanyVisibilityOnly && role !== "managementCompany";
  const hasMultipleBuildingOptions = buildingOptions.length > 1;

  const isManagementDocument = useCallback((item: StoredDocument) => {
    return (
      item.uploaderRole === "ManagementCompany" ||
      item.uploaderRole === "Accountant" ||
      item.scope === "buildingResidents" ||
      item.scope === "managementArchive"
    );
  }, []);

  const isPersonalDocument = useCallback((item: StoredDocument) => {
    if (isOwnManagementArchiveDocument(item, effectiveUserId)) return true;
    if (item.scope === "platformPrivate") return item.ownerUserId === effectiveUserId;
    if (item.scope === "apartmentPrivate") return true;
    return item.scope === "privateApartment" && (!item.ownerUserId || item.ownerUserId === effectiveUserId);
  }, [effectiveUserId]);

  const isSharedWithBuildingDocument = useCallback((item: StoredDocument) => {
    return item.scope === "buildingResidents";
  }, []);

  const isInternalManagementArchiveDocument = useCallback((item: StoredDocument) => {
    return (
      item.scope === "managementArchive" &&
      (item.uploaderRole === "ManagementCompany" || item.uploaderRole === "Accountant")
    );
  }, []);

  const isOpenManagementAccessDocument = useCallback((item: StoredDocument) => {
    return isOwnManagementArchiveDocument(item, effectiveUserId);
  }, [effectiveUserId]);

  const canDeleteDocument = useCallback((item: StoredDocument) => {
    if (managementCompanyVisibilityOnly && role === "platformAdmin" && item.scope === "platformPrivate" && item.ownerUserId === effectiveUserId) return true;
    if (managementCompanyVisibilityOnly && role === "platformAdmin" && item.scope === "managementArchive" && item.ownerUserId === effectiveUserId) return true;
    if (item.ownerUserId === effectiveUserId) return true;
    return role === "managementCompany" && item.scope !== "apartmentPrivate" && item.scope !== "privateApartment";
  }, [effectiveUserId, managementCompanyVisibilityOnly, role]);

  const canEditDocumentAccess = useCallback((item: StoredDocument) => {
    if (managementCompanyVisibilityOnly && role === "platformAdmin" && item.scope === "platformPrivate" && item.ownerUserId === effectiveUserId) return true;
    if (managementCompanyVisibilityOnly && role === "platformAdmin" && item.scope === "managementArchive" && item.ownerUserId === effectiveUserId) return true;
    if (item.ownerUserId === effectiveUserId) return true;
    return role === "managementCompany" && item.scope !== "apartmentPrivate" && item.scope !== "privateApartment";
  }, [effectiveUserId, managementCompanyVisibilityOnly, role]);

  useEffect(() => {
    let mounted = true;

    const loadPromise = role === "managementCompany" || managementCompanyVisibilityOnly || buildingDocumentsOnly
      ? getDocuments()
      : Promise.all(apartmentOptions.map((apartment) => getDocuments({ apartmentId: apartment.id }))).then((responses) => ({
          items: Array.from(
            new Map(
              responses
                .flatMap((response) => response.items ?? [])
                .map((item) => [item.id, item] as const),
            ).values(),
          ),
        }));

    loadPromise
      .then((response) => {
        if (!mounted) return;
        setDocuments((response.items ?? []).map(toStoredDocument));
      })
      .catch((loadError) => {
        if (!mounted) return;
        setError(loadError instanceof Error ? loadError.message : t("errors.loadFailed"));
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [apartmentOptions, buildingDocumentsOnly, managementCompanyVisibilityOnly, role, t]);

  useEffect(() => {
    if (buildingId || !buildingOptions[0]) return;
    setBuildingId(buildingOptions[0].id);
  }, [buildingId, buildingOptions]);

  useEffect(() => {
    if (archiveBuildingId || !archiveBuildingOptions[0]) return;
    setArchiveBuildingId(archiveBuildingOptions[0].id);
  }, [archiveBuildingId, archiveBuildingOptions]);

  useEffect(() => {
    if (buildingId && !buildingOptions.some((building) => building.id === buildingId)) {
      setBuildingId(buildingOptions[0]?.id ?? "");
    }
  }, [buildingId, buildingOptions]);

  useEffect(() => {
    if (archiveBuildingId && !archiveBuildingOptions.some((building) => building.id === archiveBuildingId)) {
      setArchiveBuildingId(archiveBuildingOptions[0]?.id ?? "");
    }
  }, [archiveBuildingId, archiveBuildingOptions]);

  useEffect(() => {
    if (apartmentId || !apartmentOptions[0]) return;
    setApartmentId(apartmentOptions[0].id);
  }, [apartmentId, apartmentOptions]);

  useEffect(() => {
    const currentStillVisible = archiveApartmentOptions.some((apartment) => apartment.id === archiveApartmentId);
    if (currentStillVisible) return;
    setArchiveApartmentId(archiveApartmentOptions[0]?.id || "");
  }, [archiveApartmentId, archiveApartmentOptions]);

  useEffect(() => {
    if (role !== "managementCompany" && scope === "apartmentResidents") {
      setScope("apartmentPrivate");
    }
  }, [role, scope]);

  useEffect(() => {
    if (buildingDocumentsOnly && activeTab === "apartments") {
      setActiveTab("all");
      return;
    }

    if (role === "managementCompany" && (activeTab === "management" || activeTab === "personal")) {
      setActiveTab("all");
    }
  }, [activeTab, buildingDocumentsOnly, role]);

  const allDocuments = useMemo(() => {
    const liveDocuments = role === "managementCompany" ? serverDocuments.map(toStoredServerDocument) : [];
    const merged = [...documents, ...liveDocuments];
    const unique = new Map(merged.map((item) => [item.id, item]));

    return Array.from(unique.values()).filter((item) =>
      canSeeDocument(item, role, effectiveUserId, managementCompanyVisibilityOnly, buildingDocumentsOnly),
    );
  }, [buildingDocumentsOnly, documents, effectiveUserId, managementCompanyVisibilityOnly, role, serverDocuments]);

  const filteredDocuments = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return allDocuments.filter((item) => {
      if (archiveBuildingId && item.buildingId !== archiveBuildingId && !(buildingDocumentsOnly && isOpenManagementAccessDocument(item))) return false;
      if (role !== "managementCompany" && !archiveBuildingId && archiveApartmentId) {
        const isSelectedApartmentDocument = item.apartmentId === archiveApartmentId;
        const isSelectedBuildingDocument =
          Boolean(selectedArchiveApartment?.buildingId) && item.buildingId === selectedArchiveApartment?.buildingId;

        if (!isSelectedApartmentDocument && !isSelectedBuildingDocument) return false;
      }
      if (activeTab === "management" && !isManagementDocument(item)) return false;
      if (activeTab === "personal" && !isPersonalDocument(item)) return false;
      if (activeTab === "apartments" && (!archiveApartmentId || item.apartmentId !== archiveApartmentId)) return false;
      if (activeTab === "shared" && !isSharedWithBuildingDocument(item)) return false;
      if (activeTab === "internalArchive" && !isInternalManagementArchiveDocument(item)) return false;
      if (activeTab === "openAccess" && !isOpenManagementAccessDocument(item)) return false;
      if (!normalizedQuery) return true;

      return [
        item.title,
        item.fileName,
        item.buildingName,
        item.apartmentLabel,
        getScopeLabel(item.scope, role, translatedScopeLabels, shareWithManagementLabel),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));
    });
  }, [
    activeTab,
    allDocuments,
    archiveBuildingId,
    archiveApartmentId,
    buildingDocumentsOnly,
    isInternalManagementArchiveDocument,
    isManagementDocument,
    isOpenManagementAccessDocument,
    isPersonalDocument,
    isSharedWithBuildingDocument,
    query,
    role,
    selectedArchiveApartment?.buildingId,
    translatedScopeLabels,
    shareWithManagementLabel,
  ]);

  const scopedArchiveDocuments = archiveBuildingId
    ? allDocuments.filter((item) => item.buildingId === archiveBuildingId || (buildingDocumentsOnly && isOpenManagementAccessDocument(item)))
    : role !== "managementCompany" && archiveApartmentId
      ? allDocuments.filter((item) => {
        const isSelectedApartmentDocument = item.apartmentId === archiveApartmentId;
        const isSelectedBuildingDocument =
          Boolean(selectedArchiveApartment?.buildingId) && item.buildingId === selectedArchiveApartment?.buildingId;

        return isSelectedApartmentDocument || isSelectedBuildingDocument;
      })
      : allDocuments;
  const managementCount = scopedArchiveDocuments.filter((item) => isManagementDocument(item)).length;
  const personalCount = scopedArchiveDocuments.filter((item) => isPersonalDocument(item)).length;
  const sharedCount = scopedArchiveDocuments.filter((item) => isSharedWithBuildingDocument(item)).length;
  const internalArchiveCount = scopedArchiveDocuments.filter((item) => isInternalManagementArchiveDocument(item)).length;
  const openAccessCount = scopedArchiveDocuments.filter((item) => isOpenManagementAccessDocument(item)).length;
  const archiveTabs = managementCompanyVisibilityOnly
    ? [
      { id: "all" as const, label: t("tabs.all"), count: scopedArchiveDocuments.length },
      { id: "openAccess" as const, label: t("tabs.openAccess"), count: openAccessCount },
      { id: "personal" as const, label: t("tabs.personal"), count: personalCount },
    ]
    : role === "managementCompany"
    ? [
      { id: "all" as const, label: t("tabs.all"), count: scopedArchiveDocuments.length },
      ...(buildingDocumentsOnly ? [] : [{ id: "apartments" as const, label: t("tabs.apartments"), count: null }]),
      { id: "shared" as const, label: t("tabs.shared"), count: sharedCount },
      { id: "internalArchive" as const, label: t("tabs.internalArchive"), count: internalArchiveCount },
      ...(buildingDocumentsOnly ? [{ id: "personal" as const, label: t("tabs.personal"), count: personalCount }] : []),
    ]
    : [
      { id: "all" as const, label: t("tabs.all"), count: scopedArchiveDocuments.length },
      { id: "management" as const, label: t("tabs.management"), count: managementCount },
      { id: "openAccess" as const, label: t("tabs.openAccess"), count: openAccessCount },
      { id: "personal" as const, label: t("tabs.personal"), count: personalCount },
    ];
  const accessScopeOptions = useMemo<DocumentScope[]>(() => {
    if (managementCompanyVisibilityOnly) {
      return ["platformPrivate", "managementArchive"];
    }

    if (role === "managementCompany") {
      return buildingDocumentsOnly
        ? ["buildingResidents", "managementArchive"]
        : ["buildingResidents", "apartmentResidents", "managementArchive"];
    }

    return ["managementArchive", "apartmentPrivate", "privateApartment"];
  }, [buildingDocumentsOnly, managementCompanyVisibilityOnly, role]);

  function resetCreateForm() {
    setError("");
    setTitle("");
    setSelectedFile(null);
    setScope(managementCompanyVisibilityOnly ? "platformPrivate" : role === "managementCompany" || buildingDocumentsOnly ? "buildingResidents" : "apartmentPrivate");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function openCreateModal() {
    resetCreateForm();
    setIsCreateOpen(true);
  }

  function closeCreateModal() {
    resetCreateForm();
    setIsCreateOpen(false);
  }

  async function handleSave() {
    setError("");

    if (!selectedFile) {
      setError(t("errors.fileRequired"));
      return;
    }

    const targetBuildingId = buildingId || selectedApartment?.buildingId || "";

    if ((scope === "buildingResidents" || (scope === "managementArchive" && role !== "managementCompany")) && !targetBuildingId) {
      setError(t("errors.buildingRequired"));
      return;
    }

    if ((scope === "apartmentResidents" || scope === "apartmentPrivate" || scope === "privateApartment") && !apartmentId) {
      setError(t("errors.apartmentRequired"));
      return;
    }

    setIsSaving(true);

    try {
      const response = await uploadDocument({
        title: title.trim() || selectedFile.name.replace(/\.[^.]+$/, ""),
        scope,
        buildingId:
          scope === "buildingResidents" || (scope === "managementArchive" && role !== "managementCompany")
            ? targetBuildingId
            : undefined,
        apartmentId:
          scope === "apartmentResidents" || scope === "apartmentPrivate" || scope === "privateApartment"
            ? apartmentId
            : undefined,
        file: selectedFile,
      });

      setDocuments((current) => [toStoredDocument(response.item), ...current]);
      closeCreateModal();
      notifications.success(t("toast.saved"));
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : t("errors.saveFailed");
      setError(message);
      notifications.error(message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setError("");

    try {
      await deleteDocument(id);
      setDocuments((current) => current.filter((item) => item.id !== id));
      notifications.success(t("toast.deleted"));
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : t("errors.deleteFailed");
      setError(message);
      notifications.error(message);
    }
  }

  function openAccessModal(item: StoredDocument) {
    setEditingAccessDocument(item);
    setAccessDraftScope(item.scope);
    setAccessDraftApartmentId(item.apartmentId || "");
  }

  async function handleAccessChange(item: StoredDocument, nextScope: DocumentScope, nextApartmentId?: string) {
    if (item.scope === nextScope && (!nextApartmentId || item.apartmentId === nextApartmentId)) return;

    setError("");
    setUpdatingAccessId(item.id);

    try {
      const response = await updateDocumentAccess(item.id, {
        scope: nextScope,
        buildingId:
          nextScope === "buildingResidents" || (nextScope === "managementArchive" && role !== "managementCompany")
            ? item.buildingId || buildingId || selectedApartment?.buildingId
            : undefined,
        apartmentId:
          nextScope === "apartmentResidents" || nextScope === "apartmentPrivate" || nextScope === "privateApartment"
            ? nextApartmentId || item.apartmentId || apartmentId
            : undefined,
      });

      setDocuments((current) =>
        current.map((document) =>
          document.id === item.id ? toStoredDocument(response.item) : document,
        ),
      );
      setEditingAccessDocument(null);
      notifications.success(t("toast.accessUpdated"));
    } catch (accessError) {
      const message = accessError instanceof Error ? accessError.message : t("errors.accessUpdateFailed");
      setError(message);
      notifications.error(message);
    } finally {
      setUpdatingAccessId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5">
        <Modal
          open={isCreateOpen}
          onClose={closeCreateModal}
          title={t("create.title")}
          size="lg"
        >
        <div>
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-semibold text-slate-500">{t("fields.title")}</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                placeholder={t("fields.titlePlaceholder")}
              />
            </label>

            <div>
              <p className="text-xs font-semibold text-slate-500">{t("fields.access")}</p>
              <div className="mt-2 grid gap-2">
                {canUseBuildingResidents ? (
                  <button
                    type="button"
                    onClick={() => setScope("buildingResidents")}
                    className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition ${
                      scope === "buildingResidents" ? "border-sky-500 bg-sky-50" : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <FiUsers className="mt-0.5 h-4 w-4 text-sky-600" />
                    <span>
                      <span className="block text-sm font-semibold leading-5 text-slate-900">
                        {getScopeLabel("buildingResidents", role, translatedScopeLabels, shareWithManagementLabel)}
                      </span>
                      <span className="block text-xs leading-4 text-slate-500">{translatedScopeDescriptions.buildingResidents}</span>
                    </span>
                  </button>
                ) : null}

                {role === "managementCompany" && !buildingDocumentsOnly ? (
                  <button
                    type="button"
                    onClick={() => setScope("apartmentResidents")}
                    className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition ${
                      scope === "apartmentResidents" ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <FiHome className="mt-0.5 h-4 w-4 text-blue-600" />
                    <span>
                      <span className="block text-sm font-semibold leading-5 text-slate-900">{translatedScopeLabels.apartmentResidents}</span>
                      <span className="block text-xs leading-4 text-slate-500">{translatedScopeDescriptions.apartmentResidents}</span>
                    </span>
                  </button>
                ) : null}

                {managementCompanyVisibilityOnly ? (
                  <button
                    type="button"
                    onClick={() => setScope("platformPrivate")}
                    className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition ${
                      scope === "platformPrivate" ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <FiLock className="mt-0.5 h-4 w-4 text-emerald-600" />
                    <span>
                      <span className="block text-sm font-semibold leading-5 text-slate-900">{translatedScopeLabels.platformPrivate}</span>
                      <span className="block text-xs leading-4 text-slate-500">{translatedScopeDescriptions.platformPrivate}</span>
                    </span>
                  </button>
                ) : null}

                {canShareWithManagement ? (
                  <button
                    type="button"
                    onClick={() => setScope("managementArchive")}
                    className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition ${
                      scope === "managementArchive" ? "border-sky-500 bg-sky-50" : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <FiUsers className="mt-0.5 h-4 w-4 text-sky-600" />
                    <span>
                      <span className="block text-sm font-semibold leading-5 text-slate-900">
                        {getScopeLabel("managementArchive", role, translatedScopeLabels, shareWithManagementLabel)}
                      </span>
                      <span className="block text-xs leading-4 text-slate-500">
                        {t("scopes.managementArchive.ownerShareDescription")}
                      </span>
                    </span>
                  </button>
                ) : null}

                {canUsePrivateApartment ? (
                  <button
                    type="button"
                    onClick={() => setScope("apartmentPrivate")}
                    className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition ${
                      scope === "apartmentPrivate" ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <FiHome className="mt-0.5 h-4 w-4 text-blue-600" />
                    <span>
                      <span className="block text-sm font-semibold leading-5 text-slate-900">{translatedScopeLabels.apartmentPrivate}</span>
                      <span className="block text-xs leading-4 text-slate-500">{translatedScopeDescriptions.apartmentPrivate}</span>
                    </span>
                  </button>
                ) : null}

                {canUsePrivateApartment ? (
                  <button
                    type="button"
                    onClick={() => setScope("privateApartment")}
                    className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition ${
                      scope === "privateApartment" ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <FiLock className="mt-0.5 h-4 w-4 text-emerald-600" />
                    <span>
                      <span className="block text-sm font-semibold leading-5 text-slate-900">{translatedScopeLabels.privateApartment}</span>
                      <span className="block text-xs leading-4 text-slate-500">{translatedScopeDescriptions.privateApartment}</span>
                    </span>
                  </button>
                ) : null}

                {canUseManagementArchive ? (
                  <button
                    type="button"
                    onClick={() => setScope("managementArchive")}
                    className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition ${
                      scope === "managementArchive" ? "border-slate-700 bg-slate-50" : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <FiShield className="mt-0.5 h-4 w-4 text-slate-700" />
                    <span>
                      <span className="block text-sm font-semibold leading-5 text-slate-900">{translatedScopeLabels.managementArchive}</span>
                      <span className="block text-xs leading-4 text-slate-500">{translatedScopeDescriptions.managementArchive}</span>
                    </span>
                  </button>
                ) : null}
              </div>
            </div>

            {(scope === "buildingResidents" || (scope === "managementArchive" && role !== "managementCompany")) && hasMultipleBuildingOptions ? (
              <label className="block">
                <span className="text-xs font-semibold text-slate-500">{t("fields.building")}</span>
                <select
                  value={buildingId}
                  onChange={(event) => setBuildingId(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                >
                  {buildingOptions.map((building) => (
                    <option key={building.id} value={building.id}>
                      {building.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {(scope === "apartmentResidents" || scope === "apartmentPrivate" || scope === "privateApartment") && hasMultipleApartmentOptions ? (
              <label className="block">
                <span className="text-xs font-semibold text-slate-500">{t("fields.apartment")}</span>
                <select
                  value={apartmentId}
                  onChange={(event) => setApartmentId(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                >
                  {apartmentOptions.map((apartment) => (
                    <option key={apartment.id} value={apartment.id}>
                      {apartment.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-center transition hover:border-sky-400 hover:bg-sky-50">
              <FiFileText className="h-5 w-5 text-slate-500" />
              <span className="mt-1.5 text-sm font-semibold text-slate-800">
                {selectedFile ? selectedFile.name : t("fields.chooseFile")}
              </span>
              <span className="mt-1 text-xs text-slate-500">
                {selectedFile ? formatBytes(selectedFile.size) : t("fields.fileTypes")}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                className="sr-only"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
              />
            </label>

            {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSaving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-sky-600/20 transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FiUploadCloud className="h-4 w-4" />
              {isSaving ? t("actions.saving") : t("actions.saveDocument")}
            </button>
          </div>
        </div>
        </Modal>

        <section className="min-w-0 p-0">
          {archiveBuildingOptions.length > 1 ? (
            <>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="relative w-full sm:w-80">
                    <select
                      value={archiveBuildingId}
                      onChange={(event) => setArchiveBuildingId(event.target.value)}
                      className="h-11 w-full appearance-none rounded-2xl border border-slate-200 bg-white pl-4 pr-11 text-sm font-medium text-slate-900 shadow-sm shadow-slate-950/[0.03] outline-none transition hover:border-slate-300 focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                      aria-label={t("aria.selectBuilding")}
                    >
                      {archiveBuildingOptions.map((building) => (
                        <option key={building.id} value={building.id}>
                          {building.name}
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-slate-400">
                      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                        <path d="m5.75 8 4.25 4.25L14.25 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </div>
                </div>
                <div className="flex w-full items-center gap-2 lg:w-auto">
                  <label className="relative block min-w-0 flex-1 lg:w-80">
                    <FiSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-sm font-medium text-slate-900 shadow-sm shadow-slate-950/[0.03] outline-none transition hover:border-slate-300 focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                      placeholder={t("search.placeholder")}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={openCreateModal}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-600 text-white shadow-sm shadow-sky-600/20 transition hover:bg-sky-700"
                    title={t("actions.addDocument")}
                    aria-label={t("actions.addDocument")}
                  >
                    <FiPlus className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                {archiveTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`inline-flex min-w-0 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm font-semibold leading-4 transition sm:justify-start ${
                      activeTab === tab.id
                        ? "border-sky-500 bg-sky-50 text-sky-700"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span className="min-w-0 text-left break-words">{tab.label}</span>
                    {tab.count !== null ? (
                      <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs text-slate-500 ring-1 ring-slate-200">
                        {tab.count}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                {archiveTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`inline-flex min-w-0 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm font-semibold leading-4 transition sm:justify-start ${
                      activeTab === tab.id
                        ? "border-sky-500 bg-sky-50 text-sky-700"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span className="min-w-0 text-left break-words">{tab.label}</span>
                    {tab.count !== null ? (
                      <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs text-slate-500 ring-1 ring-slate-200">
                        {tab.count}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>

              <div className="flex w-full items-center gap-2 xl:w-auto">
                <label className="relative block min-w-0 flex-1 xl:w-80">
                  <FiSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-sm font-medium text-slate-900 shadow-sm shadow-slate-950/[0.03] outline-none transition hover:border-slate-300 focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                    placeholder={t("search.placeholder")}
                  />
                </label>
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-600 text-white shadow-sm shadow-sky-600/20 transition hover:bg-sky-700"
                  title={t("actions.addDocument")}
                  aria-label={t("actions.addDocument")}
                >
                  <FiPlus className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}

          {role === "managementCompany" && !buildingDocumentsOnly && activeTab === "apartments" && hasMultipleArchiveApartmentOptions ? (
            <label className="mt-4 block max-w-md">
              <span className="text-xs font-semibold text-slate-500">{t("fields.apartment")}</span>
              <select
                value={archiveApartmentId}
                onChange={(event) => setArchiveApartmentId(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              >
                {!archiveApartmentOptions.length ? <option value="">{t("fallbacks.noApartments")}</option> : null}
                {archiveApartmentOptions.map((apartment) => (
                  <option key={apartment.id} value={apartment.id}>
                    {apartment.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {isLoading ? (
            <div className="mt-4 rounded-lg bg-slate-50 px-4 py-6 text-sm text-slate-500">{t("loading")}</div>
          ) : null}

          {filteredDocuments.length ? (
            <div className="mt-4 grid gap-3 md:hidden">
              {filteredDocuments.map((item) => {
                const href = buildDownloadHref(item);

                return (
                  <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">{item.title}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {item.fileName} · {item.size ? formatBytes(item.size) : t("fallbacks.unknownSize")}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-slate-500">
                        {formatStableDate(item.uploadedAt)}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-slate-600">
                      <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 font-semibold text-slate-700 ring-1 ring-slate-200">
                        {getScopeIcon(item.scope)}
                        <span className="truncate">{getScopeLabel(item.scope, role, translatedScopeLabels, shareWithManagementLabel)}</span>
                      </span>
                      {item.buildingName ? (
                        <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white px-2.5 py-1 ring-1 ring-slate-200">
                          <FiHome className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{item.buildingName}</span>
                        </span>
                      ) : null}
                      {item.apartmentLabel ? (
                        <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white px-2.5 py-1 ring-1 ring-slate-200">
                          <FiHome className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{item.apartmentLabel}</span>
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-3 flex items-center justify-end gap-2">
                      {canEditDocumentAccess(item) ? (
                        <button
                          type="button"
                          onClick={() => openAccessModal(item)}
                          disabled={updatingAccessId === item.id}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                          title={t("actions.configureAccess")}
                        >
                          {getScopeIcon(item.scope)}
                        </button>
                      ) : null}
                      <DocumentViewerButton
                        href={href}
                        fileName={item.fileName}
                        title={item.title}
                        mimeType={item.mimeType}
                      />
                      {item.downloadUrl ? (
                        <a
                          href={href}
                          download={item.fileName}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100"
                          title={t("actions.download")}
                        >
                          <FiDownload className="h-4 w-4" />
                        </a>
                      ) : null}
                      {documents.some((document) => document.id === item.id) && canDeleteDocument(item) ? (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(item)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-100 bg-white text-red-600 transition hover:bg-red-50"
                          title={t("actions.delete")}
                        >
                          <FiTrash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}

          {filteredDocuments.length ? (
            <div className="mt-4 hidden overflow-x-auto rounded-lg border border-slate-200 md:block">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">{t("table.document")}</th>
                    <th className="px-4 py-3">{t("table.access")}</th>
                    <th className="px-4 py-3">{t("table.object")}</th>
                    <th className="px-4 py-3">{t("table.date")}</th>
                    <th className="px-4 py-3 text-right">{t("table.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {filteredDocuments.map((item) => {
                    const href = buildDownloadHref(item);

                    return (
                      <tr key={item.id} className="align-middle transition hover:bg-slate-50">
                        <td className="max-w-[360px] px-4 py-3">
                          <p className="truncate font-semibold text-slate-950">{item.title}</p>
                          <p className="mt-1 truncate text-xs text-slate-500">
                            {item.fileName} · {item.size ? formatBytes(item.size) : t("fallbacks.unknownSize")}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                            {getScopeIcon(item.scope)}
                            {getScopeLabel(item.scope, role, translatedScopeLabels, shareWithManagementLabel)}
                          </span>
                        </td>
                        <td className="max-w-[320px] px-4 py-3 text-xs text-slate-500">
                          <div className="flex flex-wrap gap-1.5">
                            {item.buildingName ? (
                              <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white px-2.5 py-1 ring-1 ring-slate-200">
                                <FiHome className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{item.buildingName}</span>
                              </span>
                            ) : null}
                            {item.apartmentLabel ? (
                              <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white px-2.5 py-1 ring-1 ring-slate-200">
                                <FiHome className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{item.apartmentLabel}</span>
                              </span>
                            ) : null}
                            {!item.buildingName && !item.apartmentLabel ? <span>{t("fallbacks.notSpecified")}</span> : null}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                          {formatStableDate(item.uploadedAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {canEditDocumentAccess(item) ? (
                              <button
                                type="button"
                                onClick={() => openAccessModal(item)}
                                disabled={updatingAccessId === item.id}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                                title={t("actions.configureAccess")}
                              >
                                {getScopeIcon(item.scope)}
                              </button>
                            ) : null}
                            <DocumentViewerButton
                              href={href}
                              fileName={item.fileName}
                              title={item.title}
                              mimeType={item.mimeType}
                            />
                            {item.downloadUrl ? (
                              <a
                                href={href}
                                download={item.fileName}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100"
                                title={t("actions.download")}
                              >
                                <FiDownload className="h-4 w-4" />
                              </a>
                            ) : null}
                            {documents.some((document) => document.id === item.id) && canDeleteDocument(item) ? (
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(item)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-100 bg-white text-red-600 transition hover:bg-red-50"
                                title={t("actions.delete")}
                              >
                                <FiTrash2 className="h-4 w-4" />
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
          ) : null}

          {!filteredDocuments.length ? (
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
              <FiFileText className="mx-auto h-7 w-7 text-slate-400" />
              <p className="mt-2 text-sm font-semibold text-slate-800">{t("empty.title")}</p>
              <p className="mt-1 text-xs text-slate-500">{t("empty.description")}</p>
            </div>
          ) : null}
        </section>
      </div>

      <Modal
        open={Boolean(editingAccessDocument)}
        onClose={() => setEditingAccessDocument(null)}
        title={t("accessModal.title")}
        size="sm"
        footer={
          editingAccessDocument ? (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingAccessDocument(null)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                {t("actions.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void handleAccessChange(editingAccessDocument, accessDraftScope, accessDraftApartmentId)}
                disabled={
                  updatingAccessId === editingAccessDocument.id ||
                  ((accessDraftScope === "apartmentResidents" || accessDraftScope === "apartmentPrivate") &&
                    hasMultipleApartmentOptions &&
                    !accessDraftApartmentId)
                }
                className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FiCheck className="h-4 w-4" />
                {updatingAccessId === editingAccessDocument.id ? t("actions.saving") : t("actions.save")}
              </button>
            </div>
          ) : null
        }
      >
        {editingAccessDocument ? (
          <div className="space-y-4">
            <div>
              <p className="truncate text-sm font-semibold text-slate-950">{editingAccessDocument.title}</p>
              <p className="mt-1 truncate text-xs text-slate-500">{editingAccessDocument.fileName}</p>
            </div>

            <div className="grid gap-2">
              {accessScopeOptions.map((option) => {
                const isActive = accessDraftScope === option;

                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setAccessDraftScope(option)}
                    disabled={updatingAccessId === editingAccessDocument.id}
                    className={`flex items-start gap-3 rounded-lg border px-3 py-3 text-left transition disabled:cursor-not-allowed ${
                      isActive
                        ? "border-sky-500 bg-sky-50 text-sky-800"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    }`}
                  >
                    <span className="mt-0.5 text-slate-600">{getScopeIcon(option)}</span>
                    <span>
                      <span className="block text-sm font-semibold">
                        {getScopeLabel(option, role, translatedScopeLabels, shareWithManagementLabel)}
                      </span>
                      <span className="mt-0.5 block text-xs leading-4 text-slate-500">{translatedScopeDescriptions[option]}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {(accessDraftScope === "apartmentResidents" || accessDraftScope === "apartmentPrivate") && hasMultipleApartmentOptions ? (
              <label className="block">
                <span className="text-xs font-semibold text-slate-500">{t("fields.documentApartment")}</span>
                <select
                  value={accessDraftApartmentId}
                  onChange={(event) => setAccessDraftApartmentId(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                >
                  <option value="">{t("fields.selectApartment")}</option>
                  {apartmentOptions.map((apartment) => (
                    <option key={apartment.id} value={apartment.id}>
                      {apartment.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        ) : null}
      </Modal>
      <AlertModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title={t("deleteModal.title")}
        variant="warning"
        confirmLabel={t("actions.delete")}
        cancelLabel={t("actions.cancel")}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await handleDelete(deleteTarget.id);
          setDeleteTarget(null);
        }}
      >
        {deleteTarget ? t("deleteModal.description", { title: deleteTarget.title }) : ""}
      </AlertModal>
    </div>
  );
}
