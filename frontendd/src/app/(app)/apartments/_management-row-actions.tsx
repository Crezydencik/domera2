"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ActionButtonGroup } from "@/components/ui/action-button-group";
import { Button } from "@/components/ui/button";
import { deleteApartment, getApartmentStorageSummary } from "@/shared/api/apartments";
import { useNotifications } from "@/shared/hooks/use-notifications";
import { ROUTES } from "@/shared/lib/routes";
import { TenantAccessManager } from "./[apartmentId]/tenant-access-manager";

type ApartmentRecord = Record<string, unknown>;
type ApartmentStorageSummary = {
  path: string | null;
  fileCount: number;
  hasUserFiles: boolean;
};

export interface ApartmentResidentOption {
  id: string;
  label: string;
}

function toText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function formatPossibleDate(date: unknown) {
  if (!date) return "—";
  if (date instanceof Date) return date.toISOString().slice(0, 10);
  if (typeof date === "string" && date.trim()) {
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime()) ? date.trim() : parsed.toISOString().slice(0, 10);
  }
  if (date && typeof date === "object") {
    const record = date as Record<string, unknown>;
    const seconds = typeof record.seconds === "number"
      ? record.seconds
      : typeof record._seconds === "number"
        ? record._seconds
        : undefined;
    if (seconds) return new Date(seconds * 1000).toISOString().slice(0, 10);
  }
  return "—";
}

interface ApartmentsManagementRowActionsProps {
  apartmentId: string;
  apartmentLabel: string;
  apartmentRecord: ApartmentRecord;
  currentResidentId?: string;
  currentResidentName?: string;
  isOccupied?: boolean;
  residentOptions: ApartmentResidentOption[];
  readOnly?: boolean;
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
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 pr-8">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          {description ? <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p> : null}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="Close"
        >
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
            <path d="m5.5 5.5 9 9M14.5 5.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">{children}</div>
      </div>
    </div>
  );
}

export function ApartmentsManagementRowActions({
  apartmentId,
  apartmentLabel,
  apartmentRecord,
  currentResidentId,
  isOccupied = false,
  readOnly = false,
}: ApartmentsManagementRowActionsProps) {
  const t = useTranslations("apartments");
  const ui = useTranslations("ui");
  const router = useRouter();
  const notifications = useNotifications();

  const [accessManagementOpen, setAccessManagementOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [storageSummary, setStorageSummary] = useState<ApartmentStorageSummary | null>(null);
  const [isLoadingStorageSummary, setIsLoadingStorageSummary] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const ownerEmail = toText(apartmentRecord.ownerEmail, "—");
  const ownerData = {
    email: ownerEmail,
    userId: toText(apartmentRecord.ownerId) || undefined,
    activated: apartmentRecord.ownerActivated === true || apartmentRecord.ownerActivated === "true",
    invitedAt: formatPossibleDate(apartmentRecord.ownerInvitedAt),
  };
  const tenants = Array.isArray(apartmentRecord.tenants) ? apartmentRecord.tenants : [];
  const deleteBlockedByOccupant = isOccupied || Boolean(currentResidentId);

  async function handleDeleteApartment() {
    if (readOnly) {
      notifications.warning("This apartment belongs to a locked building.");
      return;
    }

    setIsDeleting(true);

    try {
      await deleteApartment(apartmentId);
      notifications.success(t("management.feedback.apartmentDeleted", { apartment: apartmentLabel }));
      setDeleteOpen(false);
      router.refresh();
    } catch (error) {
      const fallback = t("management.errors.apartmentDeleteFailed");
      notifications.error(error instanceof Error ? error.message : fallback);
    } finally {
      setIsDeleting(false);
    }
  }

  async function openDeleteDialog() {
    if (readOnly) {
      notifications.warning("This apartment belongs to a locked building.");
      return;
    }

    setDeleteOpen(true);
    setStorageSummary(null);
    setIsLoadingStorageSummary(true);

    try {
      setStorageSummary(await getApartmentStorageSummary(apartmentId));
    } catch {
      setStorageSummary(null);
    } finally {
      setIsLoadingStorageSummary(false);
    }
  }

  return (
    <>
      <ActionButtonGroup
        actions={[
          {
            key: `${apartmentId}-details`,
            label: t("management.actions.info"),
            icon: "info",
            tone: "info",
            onClick: () => router.push(`${ROUTES.apartments}/${encodeURIComponent(apartmentId)}`),
            disabled: isDeleting,
          },
          {
            key: `${apartmentId}-access`,
            label: t("management.actions.manageAccess"),
            icon: "user",
            tone: "warning",
            disabled: readOnly || isDeleting,
            onClick: () => setAccessManagementOpen(true),
          },
          {
            key: `${apartmentId}-delete`,
            label: t("management.actions.delete"),
            icon: "delete",
            tone: "danger",
            disabled: readOnly || isDeleting,
            onClick: () => void openDeleteDialog(),
          },
        ]}
      />

      <ModalShell
        open={accessManagementOpen}
        onClose={() => setAccessManagementOpen(false)}
        title={t("management.actions.manageAccess")}
        description={t("management.dialogs.tenantAccess.description", { apartment: apartmentLabel })}
      >
        <TenantAccessManager
          apartmentId={apartmentId}
          apartmentLabel={apartmentLabel}
          compact={false}
          ownerData={ownerData}
          tenants={tenants}
          tenantColumns={[
            t("details.columns.firstName"),
            t("details.columns.lastName"),
            t("details.columns.email"),
            t("details.columns.fromDate"),
            t("details.columns.toDate"),
            t("details.columns.status"),
          ]}
          tenantsTitle={t("details.tenants")}
        />
      </ModalShell>

      <ModalShell
        open={deleteOpen}
        onClose={() => !isDeleting && setDeleteOpen(false)}
        title={t("management.dialogs.deleteApartment.title")}
        description={t("management.dialogs.deleteApartment.description", { apartment: apartmentLabel })}
      >
        <div className="space-y-4">
          {deleteBlockedByOccupant ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              {t("management.dialogs.deleteApartment.occupiedHint")}
            </div>
          ) : null}

          {isLoadingStorageSummary ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Проверяем папку квартиры в Storage...
            </div>
          ) : storageSummary?.hasUserFiles ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              В папке квартиры есть файлы ({storageSummary.fileCount}). При удалении квартиры будет удалена вся папка
              квартиры вместе с документами, счетами и показаниями.
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Папка квартиры в Storage также будет удалена.
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setDeleteOpen(false)} disabled={isDeleting}>
              {ui("cancel")}
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={() => void handleDeleteApartment()}
              disabled={isDeleting || isLoadingStorageSummary || deleteBlockedByOccupant}
            >
              {isDeleting ? t("management.dialogs.deleteApartment.deleting") : ui("delete")}
            </Button>
          </div>
        </div>
      </ModalShell>
    </>
  );
}
