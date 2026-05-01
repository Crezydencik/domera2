"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ActionButtonGroup } from "@/components/ui/action-button-group";
import { Button } from "@/components/ui/button";
import { deleteApartment, unassignApartmentResident, updateApartment } from "@/shared/api/apartments";
import { useNotifications } from "@/shared/hooks/use-notifications";
import { ROUTES } from "@/shared/lib/routes";
import { TenantAccessManager } from "./[apartmentId]/tenant-access-manager";

type ApartmentRecord = Record<string, unknown>;

export interface ApartmentResidentOption {
  id: string;
  label: string;
}

function looksLikeOpaqueId(value: string) {
  return /^[A-Za-z0-9_-]{12,}$/.test(value.trim());
}

interface ApartmentsManagementRowActionsProps {
  apartmentId: string;
  apartmentLabel: string;
  apartmentRecord: ApartmentRecord;
  currentResidentId?: string;
  currentResidentName?: string;
  residentOptions: ApartmentResidentOption[];
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
  currentResidentName,
  residentOptions,
}: ApartmentsManagementRowActionsProps) {
  const t = useTranslations("apartments");
  const ui = useTranslations("ui");
  const router = useRouter();
  const notifications = useNotifications();
  const currentResidentDisplay = currentResidentName?.trim() && !looksLikeOpaqueId(currentResidentName)
    ? currentResidentName.trim()
    : currentResidentId?.trim() && !looksLikeOpaqueId(currentResidentId)
      ? currentResidentId.trim()
      : "";

  const [accessManagementOpen, setAccessManagementOpen] = useState(false);
  const [accessTab, setAccessTab] = useState<'resident' | 'owner'>('resident');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedResidentId, setSelectedResidentId] = useState(currentResidentId ?? "");
  const [isAssigning, setIsAssigning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const normalizedResidents = useMemo(() => {
    const map = new Map<string, ApartmentResidentOption>();

    for (const option of residentOptions) {
      if (!option.id.trim()) continue;
      map.set(option.id, option);
    }

    if (currentResidentId?.trim() && !map.has(currentResidentId)) {
      map.set(currentResidentId, {
        id: currentResidentId,
        label: currentResidentDisplay || t("common.notSpecified"),
      });
    }

    return [...map.values()].sort((left, right) =>
      left.label.localeCompare(right.label, undefined, { sensitivity: "base", numeric: true }),
    );
  }, [currentResidentDisplay, currentResidentId, residentOptions, t]);

  useEffect(() => {
    if (accessManagementOpen && accessTab === 'resident') {
      setSelectedResidentId(currentResidentId ?? "");
    }
  }, [accessManagementOpen, accessTab, currentResidentId]);

  async function handleSaveResident() {
    if (selectedResidentId === (currentResidentId ?? "")) {
      setAccessManagementOpen(false);
      return;
    }

    setIsAssigning(true);

    try {
      if (selectedResidentId) {
        const chosenResident = normalizedResidents.find((resident) => resident.id === selectedResidentId);
        await updateApartment(apartmentId, { residentId: selectedResidentId });
        notifications.success(
          t("management.feedback.residentAssigned", {
            resident: chosenResident?.label ?? selectedResidentId,
            apartment: apartmentLabel,
          }),
        );
      } else {
        await unassignApartmentResident(apartmentId);
        notifications.success(t("management.feedback.residentUnassigned", { apartment: apartmentLabel }));
      }

      setAccessManagementOpen(false);
      router.refresh();
    } catch (error) {
      const fallback = t("management.errors.residentSaveFailed");
      notifications.error(error instanceof Error ? error.message : fallback);
    } finally {
      setIsAssigning(false);
    }
  }

  async function handleDeleteApartment() {
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

  const assignDisabled = !currentResidentId && normalizedResidents.length === 0;

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
            disabled: isAssigning || isDeleting,
          },
          {
            key: `${apartmentId}-access`,
            label: t("management.actions.manageAccess"),
            icon: "user",
            tone: "warning",
            disabled: assignDisabled || isAssigning || isDeleting,
            onClick: () => { setAccessTab('resident'); setAccessManagementOpen(true); },
          },
          {
            key: `${apartmentId}-delete`,
            label: t("management.actions.delete"),
            icon: "delete",
            tone: "danger",
            disabled: isAssigning || isDeleting,
            onClick: () => setDeleteOpen(true),
          },
        ]}
      />

      <ModalShell
        open={accessManagementOpen}
        onClose={() => !isAssigning && setAccessManagementOpen(false)}
        title={t("management.actions.manageAccess")}
        description={t("management.dialogs.tenantAccess.description", { apartment: apartmentLabel })}
      >
        <div>
          <div className="mb-4 flex gap-2 border-b border-slate-200">
            <button
              className={`px-4 py-2 font-semibold ${accessTab === 'resident' ? 'border-b-2 border-amber-500 text-amber-700' : 'text-slate-500'}`}
              onClick={() => setAccessTab('resident')}
            >
              {t("management.actions.assignResident")}
            </button>
            <button
              className={`px-4 py-2 font-semibold ${accessTab === 'owner' ? 'border-b-2 border-amber-500 text-amber-700' : 'text-slate-500'}`}
              onClick={() => setAccessTab('owner')}
            >
              {t("management.actions.manageAccess")}
            </button>
          </div>

          {accessTab === 'resident' && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <p className="font-medium text-slate-900">{t("management.dialogs.assignResident.currentResidentLabel")}</p>
                <p className="mt-1">
                  {currentResidentDisplay || (currentResidentId ? t("common.notSpecified") : t("management.dialogs.assignResident.noneAssigned"))}
                </p>
              </div>

              <div>
                <label htmlFor={`resident-${apartmentId}`} className="mb-1.5 block text-sm font-medium text-slate-700">
                  {t("management.dialogs.assignResident.fieldLabel")}
                </label>
                <select
                  id={`resident-${apartmentId}`}
                  value={selectedResidentId}
                  onChange={(event) => setSelectedResidentId(event.target.value)}
                  disabled={isAssigning || normalizedResidents.length === 0}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <option value="">{t("management.dialogs.assignResident.noneOption")}</option>
                  {normalizedResidents.map((resident) => (
                    <option key={resident.id} value={resident.id}>
                      {resident.label}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-slate-500">
                  {normalizedResidents.length > 0
                    ? t("management.dialogs.assignResident.hint")
                    : t("management.dialogs.assignResident.empty")}
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setAccessManagementOpen(false)} disabled={isAssigning}>
                  {ui("cancel")}
                </Button>
                <Button type="button" size="sm" onClick={() => void handleSaveResident()} disabled={isAssigning}>
                  {isAssigning ? t("management.dialogs.assignResident.saving") : ui("save")}
                </Button>
              </div>
            </div>
          )}

          {accessTab === 'owner' && (
            <TenantAccessManager
              apartmentId={apartmentId}
              apartmentLabel={apartmentLabel}
              compact={false}
            />
          )}
        </div>
      </ModalShell>

      <ModalShell
        open={deleteOpen}
        onClose={() => !isDeleting && setDeleteOpen(false)}
        title={t("management.dialogs.deleteApartment.title")}
        description={t("management.dialogs.deleteApartment.description", { apartment: apartmentLabel })}
      >
        <div className="space-y-4">
          {currentResidentId ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              {t("management.dialogs.deleteApartment.occupiedHint")}
            </div>
          ) : null}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setDeleteOpen(false)} disabled={isDeleting}>
              {ui("cancel")}
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={() => void handleDeleteApartment()}
              disabled={isDeleting || Boolean(currentResidentId)}
            >
              {isDeleting ? t("management.dialogs.deleteApartment.deleting") : ui("delete")}
            </Button>
          </div>
        </div>
      </ModalShell>
    </>
  );
}