"use client";

import { useEffect, useRef, useState } from "react";
import { AlertModal } from "@/components/ui/alert-modal";
import { DataTable } from "@/components/data-table";
import { DocumentViewerButton } from "@/components/document-viewer-button";
import { Modal } from "@/components/ui/modal";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { inviteApartmentTenant, removeApartmentOwner, removeApartmentTenant, updateApartmentOwner, resendOwnerInvitation, updateApartmentTenant } from "@/shared/api/apartments";
import { getDocuments, uploadDocument, type DocumentRecord } from "@/shared/api/documents";
import { useNotifications } from "@/shared/hooks/use-notifications";
import { FiEdit2, FiPaperclip, FiRefreshCw, FiTrash2 } from "react-icons/fi";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";
const EMPTY_CELL = "-";

type OwnerData = {
  email: string;
  userId?: string;
  activated: boolean;
  invitedAt: string;
};
type InviteHistoryItem = {
  email: string;
  date: string;
  status: string;
};
type EditTenantState = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  fromDate: string;
  until: string;
  canViewDocuments: boolean;
};
type TenantAccessManagerProps = {
  apartmentId: string;
  apartmentLabel: string;
  compact?: boolean;
  companyEmail?: string;
  ownerData?: OwnerData;
  inviteHistory?: InviteHistoryItem[];
  tenants?: unknown[];
  tenantRows?: unknown[][];
  tenantColumns?: string[];
  tenantsTitle?: string;
  canManageOwner?: boolean;
};

function buildDocumentHref(item: DocumentRecord) {
  if (!item.downloadUrl) return "";
  if (item.downloadUrl.startsWith("http://") || item.downloadUrl.startsWith("https://")) {
    return item.downloadUrl;
  }

  return `${apiBaseUrl}${item.downloadUrl}`;
}

function normalizeSearchText(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isTenantConfirmed(tenant: Record<string, unknown>) {
  if (tenant.activated === true || tenant.acceptedAt || tenant.activatedAt) return true;
  const status = typeof tenant.status === "string" ? tenant.status.trim().toLowerCase() : "";
  return status === "accepted" || status === "active";
}

function splitTenantName(value: unknown) {
  const parts = String(value ?? "").trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? EMPTY_CELL,
    lastName: parts.slice(1).join(" ") || EMPTY_CELL,
  };
}

export function TenantAccessManager({
  apartmentId,
  apartmentLabel,
  compact = false,
  companyEmail,
  ownerData,
  inviteHistory = [],
  tenants,
  tenantsTitle,
  tenantRows,
  tenantColumns,
  canManageOwner = true,
}: TenantAccessManagerProps) {
  const t = useTranslations("apartments.tenantAccess");
  const documentsT = useTranslations("documents");

  const formatPossibleDate = (date: unknown): string => {
    if (!date) return EMPTY_CELL;
    if (date instanceof Date) {
      return date.toISOString().slice(0, 10);
    }
    if (typeof date === "string" && date.trim()) {
      const d = new Date(date);
      return isNaN(d.getTime()) ? date : d.toISOString().slice(0, 10);
    }
    if (date && typeof date === "object") {
      const record = date as Record<string, unknown>;
      const seconds = typeof record.seconds === "number" ? record.seconds : 
                      typeof record._seconds === "number" ? record._seconds : null;
      if (seconds !== null) {
        return new Date(seconds * 1000).toISOString().slice(0, 10);
      }
    }
    return EMPTY_CELL;
  };

  const [tenantsState, setTenantsState] = useState(tenants ?? []);
  const router = useRouter();
  const notifications = useNotifications();
  const [tab, setTab] = useState<'owner' | 'tenants'>(canManageOwner ? "owner" : "tenants");
  const [alert, setAlert] = useState<null | { type: 'delete' | 'resend', onConfirm: () => void, title: string, message: string, variant?: 'warning' | 'error' | 'info' | 'success' }>(null);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [perpetual, setPerpetual] = useState(false);
  const [tenantCanViewDocuments, setTenantCanViewDocuments] = useState(false);
  const [tenantContractFile, setTenantContractFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const tenantContractInputRef = useRef<HTMLInputElement>(null);
  const [tenantModalOpen, setTenantModalOpen] = useState(false);
  const [ownerModalOpen, setOwnerModalOpen] = useState(false);
  const [apartmentDocuments, setApartmentDocuments] = useState<DocumentRecord[]>([]);
  const [editTenant, setEditTenant] = useState<EditTenantState | null>(null);
  const [editTenantContractFile, setEditTenantContractFile] = useState<File | null>(null);
  const [tenantEditLoading, setTenantEditLoading] = useState(false);
  const editTenantContractInputRef = useRef<HTMLInputElement>(null);

  // Owner form fields
  const [ownerFirstName, setOwnerFirstName] = useState("");
  const [ownerLastName, setOwnerLastName] = useState("");
  const [ownerContractNumber, setOwnerContractNumber] = useState("");
  const [ownerContractFile, setOwnerContractFile] = useState<File | null>(null);
  const ownerContractInputRef = useRef<HTMLInputElement>(null);
  const [isOwnerDeleted, setIsOwnerDeleted] = useState(false);
  const [editOwnerModal, setEditOwnerModal] = useState(false);
  const [editOwnerEmail, setEditOwnerEmail] = useState("");
  const [editOwnerFirstName, setEditOwnerFirstName] = useState("");
  const [editOwnerLastName, setEditOwnerLastName] = useState("");
  const [editOwnerContractNumber, setEditOwnerContractNumber] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  const [localOwner, setLocalOwner] = useState(ownerData ?? {
    email: EMPTY_CELL,
    activated: false,
    invitedAt: EMPTY_CELL,
  });

  useEffect(() => {
    setLocalOwner(ownerData ?? {
      email: EMPTY_CELL,
      activated: false,
      invitedAt: EMPTY_CELL,
    });
  }, [ownerData]);

  useEffect(() => {
    setTenantsState(tenants ?? []);
  }, [tenants]);

  useEffect(() => {
    let mounted = true;

    const loadDocuments = () => {
      getDocuments({ apartmentId })
        .then((response) => {
          if (mounted) setApartmentDocuments(response.items ?? []);
        })
        .catch(() => {
          if (mounted) setApartmentDocuments([]);
        });
    };

    const handleDocumentsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ apartmentId?: string }>).detail;
      if (!detail?.apartmentId || detail.apartmentId === apartmentId) {
        loadDocuments();
      }
    };

    loadDocuments();
    window.addEventListener("apartment-documents-updated", handleDocumentsUpdated);

    return () => {
      mounted = false;
      window.removeEventListener("apartment-documents-updated", handleDocumentsUpdated);
    };
  }, [apartmentId]);

  const hasLocalOwner =
    localOwner.email &&
    localOwner.email !== EMPTY_CELL &&
    localOwner.email.includes("@");

  async function handleInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      notifications.error(t("errors.emailRequired"));
      return;
    }
    setLoading(true);
    try {
      const result = await updateApartmentOwner(apartmentId, normalizedEmail, {
        firstName: ownerFirstName.trim(),
        lastName: ownerLastName.trim(),
        contractNumber: ownerContractNumber.trim(),
      });
      notifications.success(t("alerts.resendSuccess"));
      setEmail("");
      setOwnerFirstName("");
      setOwnerLastName("");
      setOwnerContractNumber("");
      setOwnerContractFile(null);
      if (ownerContractInputRef.current) ownerContractInputRef.current.value = "";
      setIsOwnerDeleted(false);
      setLocalOwner({
        email: normalizedEmail,
        activated: result.ownerActivated === true,
        invitedAt: new Date().toISOString(),
      });
      setOwnerModalOpen(false);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : t("errors.inviteFailed");
      notifications.error(message);
    } finally {
      setLoading(false);
    }
  }

  function openEditOwnerModal() {
    setEditOwnerEmail(localOwner.email === EMPTY_CELL ? "" : String(localOwner.email));
    setEditOwnerFirstName("");
    setEditOwnerLastName("");
    setEditOwnerContractNumber("");
    setEditOwnerModal(true);
  }

  async function handleSaveOwner() {
    const normalizedEmail = editOwnerEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      notifications.error(t("errors.emailRequired"));
      return;
    }
    setEditLoading(true);
    try {
      const result = await updateApartmentOwner(apartmentId, normalizedEmail, {
        firstName: editOwnerFirstName.trim(),
        lastName: editOwnerLastName.trim(),
        contractNumber: editOwnerContractNumber.trim(),
      });
      notifications.success(t("alerts.updateSuccess"));
      setLocalOwner({
        email: normalizedEmail,
        activated: result.ownerActivated === true,
        invitedAt: new Date().toISOString(),
      });
      setEditOwnerModal(false);
      router.refresh();
    } catch {
      notifications.error(t("alerts.updateError"));
    } finally {
      setEditLoading(false);
    }
  }

  if (compact) {
    return <div>{t("compactUnavailable")}</div>;
  }

  const columnsWithActions = tenantColumns ? [...tenantColumns, t("ownerTable.actions")] : undefined;
  const activeTab = canManageOwner ? tab : "tenants";
  const hasTenants = Array.isArray(tenantsState) && tenantsState.length > 0;

  const rowsWithActions = hasTenants
    ? tenantsState.map((tenant: any, idx: number) => {
        const nameFromFullName = splitTenantName(tenant?.name ?? tenant?.email);
        const firstName = tenant?.firstName ?? nameFromFullName.firstName;
        const lastName = tenant?.lastName ?? nameFromFullName.lastName;
        const tenantId = tenant?.userId || tenant?.email || "";
        const tenantEmail = normalizeSearchText(tenant?.email);
        const tenantName = normalizeSearchText(`${tenant?.firstName ?? ""} ${tenant?.lastName ?? ""}`.trim() || tenant?.name);
        const tenantConfirmed = isTenantConfirmed(tenant ?? {});
        const baseRow = [
          firstName,
          lastName,
          tenant?.email || EMPTY_CELL,
          formatPossibleDate(tenant?.fromDate ?? tenant?.invitedAt),
          formatPossibleDate(tenant?.until),
          tenantConfirmed ? (
            <span key={`${tenantId || idx}-status`} className="text-emerald-700">{t("tenantStatus.active")}</span>
          ) : (
            <span key={`${tenantId || idx}-status`} className="text-amber-600">{t("tenantStatus.pending")}</span>
          ),
        ];
        const contractDocument = apartmentDocuments.find((document) => {
          if (document.scope !== "apartmentPrivate") return false;
          const title = normalizeSearchText(document.title);
          return title.includes(t("contractTitleSearch").toLowerCase()) && (
            Boolean(tenantEmail && title.includes(tenantEmail)) ||
            Boolean(tenantName && title.includes(tenantName))
          );
        });
        return [
          ...baseRow,
          <div key={`tenant-actions-${tenantId}-${idx}`} className="flex items-center gap-2">
            <button
              title={t("actions.edit")}
              aria-label={t("actions.edit")}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-700 transition hover:bg-slate-50"
              type="button"
              onClick={() => setEditTenant({
                id: tenantId,
                email: String(tenant?.email ?? baseRow[2] ?? ""),
                firstName: String(tenant?.firstName ?? baseRow[0] ?? ""),
                lastName: String(tenant?.lastName ?? baseRow[1] ?? ""),
                phone: String(tenant?.phone ?? ""),
                fromDate: String(tenant?.fromDate ?? baseRow[3] ?? ""),
                until: String(tenant?.until ?? ""),
                canViewDocuments: Array.isArray(tenant?.permissions) &&
                  tenant.permissions.some((permission: unknown) => ["viewDocuments", "documents"].includes(String(permission))),
              })}
            >
              <FiEdit2 size={15} />
            </button>
            {contractDocument ? (
              <DocumentViewerButton
                href={buildDocumentHref(contractDocument)}
                fileName={contractDocument.fileName}
                title={contractDocument.title}
                mimeType={contractDocument.mimeType}
              />
            ) : null}
            <button
              title={t("actions.delete")}
              aria-label={t("actions.delete")}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-100 text-red-600 transition hover:bg-red-50"
              type="button"
              onClick={() => setAlert({
                type: 'delete',
                title: t("alerts.deleteConfirmTitle"),
                message: t("alerts.deleteConfirm"),
                variant: 'warning',
                onConfirm: async () => {
                  try {
                    await removeApartmentTenant(apartmentId, tenantId);
                    setTenantsState((prev: any[]) => prev.filter((_, i) => i !== idx));
                    notifications.success(t("alerts.deleteSuccess"));
                    router.refresh();
                  } catch {
                    notifications.error(t("alerts.deleteError"));
                  }
                }
              })}
            >
              <FiTrash2 size={15} />
            </button>
          </div>
        ];
      })
    : tenantRows;

  async function handleSaveTenant() {
    if (!editTenant) return;

    setTenantEditLoading(true);
    try {
      await updateApartmentTenant(apartmentId, editTenant.id, {
        firstName: editTenant.firstName.trim(),
        lastName: editTenant.lastName.trim(),
        phone: editTenant.phone.trim(),
        fromDate: editTenant.fromDate.trim(),
        until: editTenant.until.trim(),
        canViewDocuments: editTenant.canViewDocuments,
      });
      let contractUploadError = "";
      if (editTenantContractFile) {
        const tenantName = `${editTenant.firstName.trim()} ${editTenant.lastName.trim()}`.trim() || editTenant.id;
        try {
          await uploadDocument({
            title: t("contractTitle", { tenant: tenantName }),
            scope: "apartmentPrivate",
            apartmentId,
            file: editTenantContractFile,
          });
          const response = await getDocuments({ apartmentId });
          setApartmentDocuments(response.items ?? []);
          window.dispatchEvent(new CustomEvent("apartment-documents-updated", { detail: { apartmentId } }));
        } catch (uploadError) {
          contractUploadError = uploadError instanceof Error
            ? uploadError.message
            : t("errors.contractUploadFailed");
        }
      }
      setTenantsState((current: any[]) => current.map((tenant) => {
        const tenantId = tenant?.userId || tenant?.email || "";
        if (tenantId !== editTenant.id) return tenant;
        return {
          ...tenant,
          firstName: editTenant.firstName.trim(),
          lastName: editTenant.lastName.trim(),
          name: `${editTenant.firstName.trim()} ${editTenant.lastName.trim()}`.trim() || tenant?.email,
          phone: editTenant.phone.trim(),
          fromDate: editTenant.fromDate.trim(),
          until: editTenant.until.trim(),
          permissions: [
            "submitMeter",
            ...(editTenant.canViewDocuments ? ["viewDocuments"] : []),
          ],
        };
      }));
      notifications.success(t("alerts.updateSuccess"));
      if (contractUploadError) {
        notifications.error(contractUploadError);
      }
      setEditTenantContractFile(null);
      if (editTenantContractInputRef.current) editTenantContractInputRef.current.value = "";
      setEditTenant(null);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : t("alerts.updateError");
      notifications.error(message);
    } finally {
      setTenantEditLoading(false);
    }
  }

  return (
    <div>
      {canManageOwner && (
        <div className="mb-4 flex gap-2 border-b border-slate-200">
          <button
            className={`px-4 py-2 font-semibold ${activeTab === "owner" ? "border-b-2 border-blue-600 text-blue-700" : "text-slate-500"}`}
            onClick={() => setTab("owner")}
          >{t("tabs.owner")}</button>
          <button
            className={`px-4 py-2 font-semibold ${activeTab === "tenants" ? "border-b-2 border-blue-600 text-blue-700" : "text-slate-500"}`}
            onClick={() => setTab("tenants")}
          >{t("tabs.tenants")}</button>
        </div>
      )}
      {canManageOwner && activeTab === "owner" && (
        <div className="space-y-4">
          <div className="flex justify-start border-t border-slate-200 pt-3">
            <Button type="button" onClick={() => setOwnerModalOpen(true)} className="h-9 rounded-lg px-4 text-sm">
              {t("actions.invite")}
            </Button>
          </div>

          <Modal
            open={ownerModalOpen}
            onClose={() => setOwnerModalOpen(false)}
            title={t("actions.invite")}
            size="lg"
          >
            <form onSubmit={handleInvite} className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  type="text"
                  label={t("fields.ownerFirstName")}
                  placeholder={t("placeholders.firstName")}
                  value={ownerFirstName}
                  onChange={(event) => setOwnerFirstName(event.target.value)}
                  disabled={loading}
                  className="h-10 rounded-lg px-3 py-2 text-sm"
                />
                <Input
                  type="text"
                  label={t("fields.ownerLastName")}
                  placeholder={t("placeholders.lastName")}
                  value={ownerLastName}
                  onChange={(event) => setOwnerLastName(event.target.value)}
                  disabled={loading}
                  className="h-10 rounded-lg px-3 py-2 text-sm"
                />
                <Input
                  type="email"
                  label={t("fields.email")}
                  placeholder={t("placeholders.ownerEmail")}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={loading}
                  className="h-10 rounded-lg px-3 py-2 text-sm"
                />
                <Input
                  type="text"
                  label={t("fields.ownerContractNumber")}
                  placeholder={t("placeholders.contractNumber")}
                  value={ownerContractNumber}
                  onChange={(event) => setOwnerContractNumber(event.target.value)}
                  disabled={loading}
                  className="h-10 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-medium text-slate-700">{t("fields.ownerContractFile")}</p>
                <input
                  ref={ownerContractInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={(event) => setOwnerContractFile(event.target.files?.[0] ?? null)}
                  disabled={loading}
                  className="sr-only"
                  id="owner-contract-file"
                />
                <label
                  htmlFor="owner-contract-file"
                  className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 transition hover:border-blue-300 hover:bg-blue-50"
                >
                  <span className="flex min-w-0 items-center gap-2 font-medium">
                    <FiPaperclip className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
                    <span className="truncate">{t("actions.attachContract")}</span>
                  </span>
                  <span className="min-w-0 truncate text-right text-slate-500">
                    {ownerContractFile ? ownerContractFile.name : documentsT("fields.fileTypes")}
                  </span>
                </label>
              </div>

              <Button type="submit" disabled={loading || !email.trim() || !ownerFirstName.trim() || !ownerLastName.trim()} className="h-10 w-full rounded-lg px-4 text-sm">
                {loading ? t("actions.sending") : t("actions.invite")}
              </Button>
            </form>
          </Modal>

          {!hasLocalOwner && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5">
              <p className="text-sm font-semibold text-slate-900">{t("ownerTable.title")}</p>
              <p className="mt-1 text-sm text-slate-500">
                {"Dz\u012bvoklim v\u0113l nav piesaist\u012bts \u012bpa\u0161nieks. Uzaiciniet \u012bpa\u0161nieku, lai vi\u0146\u0161 var\u0113tu sa\u0146emt piek\u013cuvi dz\u012bvoklim."}
              </p>
            </div>
          )}

          {hasLocalOwner && (
          <div className="space-y-3">
            <h3 className="text-2xl font-semibold text-slate-900">{t("ownerTable.title")}</h3>
            <DataTable
              columns={["Email", t("ownerTable.status"), t("ownerTable.invitedAt"), t("ownerTable.actions")]}
              rows={[ [
                localOwner.email,
                isOwnerDeleted 
                  ? <span className="text-red-600 font-semibold">{t("ownerTable.deleted")}</span>
                  : localOwner.activated ? <span className="text-emerald-700">{t("owner.activated")}</span> : <span className="text-amber-600">{t("owner.notActivated")}</span>,
                formatPossibleDate(localOwner.invitedAt),
                isOwnerDeleted 
                  ? <span className="text-slate-400">{EMPTY_CELL}</span>
                  : <div className="flex items-center gap-2" key="owner-actions">
                      <button
                        title={t("actions.resend")}
                        aria-label={t("actions.resend")}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-blue-100 text-blue-600 transition hover:bg-blue-50"
                        type="button"
                        onClick={() => {
                          setAlert({
                            type: 'resend',
                            title: t("alerts.resendConfirmTitle"),
                            message: t("alerts.resendConfirm"),
                            variant: 'info',
                            onConfirm: async () => {
                              try {
                                await resendOwnerInvitation(apartmentId, localOwner.email);
                                setLocalOwner((current) => ({
                                  ...current,
                                  activated: false,
                                  invitedAt: new Date().toISOString(),
                                }));
                                notifications.success(t("alerts.resendSuccess"));
                                router.refresh();
                              } catch {
                                notifications.error(t("alerts.resendError"));
                              }
                            }
                          });
                        }}
                      >
                        <FiRefreshCw size={16} />
                      </button>
                      <button
                        title={t("actions.edit")}
                        aria-label={t("actions.edit")}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-700 transition hover:bg-slate-50"
                        type="button"
                        onClick={openEditOwnerModal}
                      >
                        <FiEdit2 size={16} />
                      </button>
                      <button
                        title={t("actions.delete")}
                        aria-label={t("actions.delete")}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-100 text-red-600 transition hover:bg-red-50"
                        type="button"
                        onClick={() => {
                          setAlert({
                            type: 'delete',
                            title: t("alerts.ownerDeleteConfirmTitle"),
                            message: t("alerts.ownerDeleteConfirm"),
                            variant: 'warning',
                            onConfirm: async () => {
                              try {
                                await removeApartmentOwner(apartmentId);
                                setLocalOwner({
                                  email: "",
                                  activated: false,
                                  invitedAt: "",
                                });
                                setIsOwnerDeleted(false);
                                notifications.success(t("alerts.ownerDeleteSuccess"));
                              router.refresh();
                            } catch {
                                notifications.error(t("alerts.ownerDeleteError"));
                              }
                            }
                          });
                        }}
                      >
                        <FiTrash2 size={16} />
                      </button>
                    </div>
              ] ]}
            />
          </div>
          )}
        </div>
      )}
      {activeTab === "tenants" && (
        <div className="space-y-4">
          {!canManageOwner ? (
            <div className="flex flex-wrap items-center gap-4">
              <h2 className="text-lg font-semibold text-slate-900">{tenantsTitle ?? t("tabs.tenants")}</h2>
              <Button type="button" onClick={() => setTenantModalOpen(true)} className="h-9 shrink-0 rounded-lg px-4 text-sm">
                {t("actions.addTenant")}
              </Button>
            </div>
          ) : (
            <div className="flex justify-start border-t border-slate-200 pt-3">
              <Button type="button" onClick={() => setTenantModalOpen(true)} className="h-9 rounded-lg px-4 text-sm">
                {t("actions.addTenant")}
              </Button>
            </div>
          )}
          <Modal
            open={tenantModalOpen}
            onClose={() => setTenantModalOpen(false)}
            title={t("actions.addTenant")}
            size="lg"
          >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const normalizedEmail = email.trim().toLowerCase();
              if (!normalizedEmail) {
                notifications.error(t("errors.emailRequired"));
                return;
              }

              if (companyEmail && companyEmail !== EMPTY_CELL && normalizedEmail === companyEmail.toLowerCase()) {
                notifications.error(t("errors.emailCantBeCompanyEmail"));
                return;
              }

              if (ownerData && typeof ownerData === 'object' && 'email' in ownerData && ownerData.email && ownerData.email !== EMPTY_CELL && normalizedEmail === (ownerData.email as string).toLowerCase()) {
                notifications.error(t("errors.emailCantBeOwnerEmail"));
                return;
              }

              if (Array.isArray(tenantsState)) {
                for (const tenant of tenantsState) {
                  if (tenant && typeof tenant === 'object') {
                    const tenantRecord = tenant as Record<string, unknown>;
                    if (typeof tenantRecord.email === 'string' && normalizedEmail === tenantRecord.email.toLowerCase()) {
                      notifications.error(t("errors.emailCantBeTenantEmail"));
                      return;
                    }
                  }
                }
              }

              setLoading(true);
              try {
                await inviteApartmentTenant(apartmentId, normalizedEmail, {
                  firstName: firstName.trim(),
                  lastName: lastName.trim(),
                  phone: phone.trim(),
                  fromDate: fromDate.trim(),
                  until: perpetual ? "" : toDate.trim(),
                  canViewDocuments: tenantCanViewDocuments,
                });
                let contractUploadError = "";
                if (tenantContractFile) {
                  const tenantName = `${firstName.trim()} ${lastName.trim()}`.trim() || normalizedEmail;
                  try {
                    await uploadDocument({
                      title: t("contractTitle", { tenant: tenantName }),
                      scope: "apartmentPrivate",
                      apartmentId,
                      file: tenantContractFile,
                    });
                    window.dispatchEvent(new CustomEvent("apartment-documents-updated", { detail: { apartmentId } }));
                  } catch (uploadError) {
                    contractUploadError = uploadError instanceof Error
                      ? uploadError.message
                      : t("errors.contractUploadFailed");
                  }
                }
                notifications.success(t("success.invited", { email: normalizedEmail, apartment: apartmentLabel }));
                if (contractUploadError) {
                  notifications.error(contractUploadError);
                }
                setEmail("");
                setFirstName("");
                setLastName("");
                setPhone("");
                setFromDate("");
                setToDate("");
                setPerpetual(false);
                setTenantCanViewDocuments(false);
                setTenantContractFile(null);
                if (tenantContractInputRef.current) tenantContractInputRef.current.value = "";
                setTenantModalOpen(false);
                setTenantsState((prev: any[]) => [...prev, { 
                  email: normalizedEmail,
                  name: `${firstName} ${lastName}`.trim(),
                  firstName: firstName,
                  lastName: lastName,
                  phone: phone,
                  fromDate,
                  until: perpetual ? "" : toDate,
                  permissions: [
                    "submitMeter",
                    ...(tenantCanViewDocuments ? ["viewDocuments"] : []),
                  ],
                  status: "Pending",
                  invitedAt: new Date().toISOString()
                }]);
                router.refresh();
              } catch (error) {
                const message = error instanceof Error ? error.message : t("errors.inviteFailed");
                notifications.error(message);
              } finally {
                setLoading(false);
              }
            }}
            className="space-y-5"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                type="text"
                label={t("fields.firstName")}
                placeholder={t("placeholders.firstName")}
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                disabled={loading}
                className="h-10 rounded-lg px-3 py-2 text-sm"
              />
              <Input
                type="text"
                label={t("fields.lastName")}
                placeholder={t("placeholders.lastName")}
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                disabled={loading}
                className="h-10 rounded-lg px-3 py-2 text-sm"
              />
              <PhoneInput
                label={t("fields.phone")}
                placeholder={t("placeholders.phone")}
                value={phone}
                onChange={e => setPhone(e.target.value)}
                disabled={loading}
                className="h-10 rounded-lg px-3 py-2 text-sm"
              />
              <Input
                type="email"
                label={t("fields.email")}
                placeholder={t("placeholders.email")}
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={loading}
                className="h-10 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  type="date"
                  label={t("fields.from")}
                  value={fromDate}
                  onChange={e => setFromDate(e.target.value)}
                  disabled={loading}
                  className="h-10 rounded-lg px-3 py-2 text-sm"
                />
                {!perpetual && (
                  <Input
                    type="date"
                    label={t("fields.to")}
                    value={toDate}
                    onChange={e => setToDate(e.target.value)}
                    disabled={loading}
                    className="h-10 rounded-lg px-3 py-2 text-sm"
                  />
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex min-h-10 items-center gap-2 rounded-lg bg-white px-3 text-sm text-slate-700 ring-1 ring-slate-200">
                  <input
                    type="checkbox"
                    checked={perpetual}
                    onChange={e => {
                      setPerpetual(e.target.checked);
                      if (e.target.checked) setToDate("");
                    }}
                    disabled={loading}
                  />
                  {t("fields.perpetual")}
                </label>
                <label className="flex min-h-10 items-center gap-2 rounded-lg bg-white px-3 text-sm text-slate-700 ring-1 ring-slate-200">
                  <input
                    type="checkbox"
                    checked={tenantCanViewDocuments}
                    onChange={e => setTenantCanViewDocuments(e.target.checked)}
                    disabled={loading}
                  />
                  {t("fields.documentsAccess")}
                </label>
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-medium text-slate-700">{t("fields.ownerContractFile")}</p>
              <input
                ref={tenantContractInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                onChange={(event) => setTenantContractFile(event.target.files?.[0] ?? null)}
                disabled={loading}
                className="sr-only"
                id="tenant-contract-file"
              />
              <label
                htmlFor="tenant-contract-file"
                className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 transition hover:border-blue-300 hover:bg-blue-50"
              >
                <span className="flex min-w-0 items-center gap-2 font-medium">
                  <FiPaperclip className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
                  <span className="truncate">{t("actions.attachContract")}</span>
                </span>
                <span className="min-w-0 truncate text-right text-slate-500">
                  {tenantContractFile ? tenantContractFile.name : documentsT("fields.fileTypes")}
                </span>
              </label>
            </div>
            <Button type="submit" disabled={loading || !email.trim() || !firstName.trim() || !lastName.trim()} className="h-10 w-full rounded-lg px-4 text-sm">
              {loading ? t("actions.adding") : t("actions.addTenant")}
            </Button>
          </form>
          </Modal>
          {!hasTenants && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5">
              <p className="text-sm font-semibold text-slate-900">{tenantsTitle ?? t("tabs.tenants")}</p>
              <p className="mt-1 text-sm text-slate-500">
                {"Dz\u012bvoklim v\u0113l nav piesaist\u012btu iem\u012btnieku vai \u012brnieku. Pievienojiet iem\u012btnieku, lai vi\u0146\u0161 var\u0113tu izmantot dz\u012bvok\u013ca piek\u013cuvi."}
              </p>
            </div>
          )}
          {hasTenants && rowsWithActions && rowsWithActions.length > 0 && (
            <>
              {canManageOwner && tenantsTitle && (
                <h3 className="text-2xl font-semibold text-slate-900">{tenantsTitle}</h3>
              )}
              {columnsWithActions && (
                <DataTable columns={columnsWithActions} rows={rowsWithActions as React.ReactNode[][]} />
              )}
            </>
          )}
        </div>
      )}
      
      {editOwnerModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">{t("actions.editOwner")}</h3>
            <div className="space-y-4">
              <Input
                type="email"
                label={t("fields.email")}
                placeholder={t("placeholders.ownerEmail")}
                value={editOwnerEmail}
                onChange={(e) => setEditOwnerEmail(e.target.value)}
                disabled={editLoading}
              />
              <Input
                type="text"
                label={t("fields.ownerFirstName")}
                placeholder={t("placeholders.firstName")}
                value={editOwnerFirstName}
                onChange={(e) => setEditOwnerFirstName(e.target.value)}
                disabled={editLoading}
              />
              <Input
                type="text"
                label={t("fields.ownerLastName")}
                placeholder={t("placeholders.lastName")}
                value={editOwnerLastName}
                onChange={(e) => setEditOwnerLastName(e.target.value)}
                disabled={editLoading}
              />
              <Input
                type="text"
                label={t("fields.ownerContractNumber")}
                placeholder={t("placeholders.contractNumber")}
                value={editOwnerContractNumber}
                onChange={(e) => setEditOwnerContractNumber(e.target.value)}
                disabled={editLoading}
              />
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditOwnerModal(false)}
                disabled={editLoading}
                className="flex-1 px-4 py-2 rounded border border-slate-300 hover:bg-slate-50 disabled:opacity-50"
              >
                {t("actions.cancel")}
              </button>
              <button
                onClick={handleSaveOwner}
                disabled={editLoading}
                className="flex-1 px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {editLoading ? t("actions.saving") : t("actions.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={Boolean(editTenant)}
        onClose={() => {
          setEditTenant(null);
          setEditTenantContractFile(null);
          if (editTenantContractInputRef.current) editTenantContractInputRef.current.value = "";
        }}
        title={t("actions.editTenant")}
        size="lg"
      >
        {editTenant && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                type="text"
                label={t("fields.firstName")}
                value={editTenant.firstName}
                onChange={(event) => setEditTenant((current) => current ? { ...current, firstName: event.target.value } : current)}
                disabled={tenantEditLoading}
                className="h-9 rounded-lg px-3 py-1.5"
              />
              <Input
                type="text"
                label={t("fields.lastName")}
                value={editTenant.lastName}
                onChange={(event) => setEditTenant((current) => current ? { ...current, lastName: event.target.value } : current)}
                disabled={tenantEditLoading}
                className="h-9 rounded-lg px-3 py-1.5"
              />
              <PhoneInput
                label={t("fields.phone")}
                value={editTenant.phone}
                onChange={(event) => setEditTenant((current) => current ? { ...current, phone: event.target.value } : current)}
                disabled={tenantEditLoading}
                className="h-9 rounded-lg px-3 py-1.5"
              />
              <Input
                type="email"
                label="Email"
                value={editTenant.email}
                disabled
                className="h-9 rounded-lg px-3 py-1.5"
              />
              <Input
                type="date"
                label={t("fields.from")}
                value={editTenant.fromDate}
                onChange={(event) => setEditTenant((current) => current ? { ...current, fromDate: event.target.value } : current)}
                disabled={tenantEditLoading}
                className="h-9 rounded-lg px-3 py-1.5"
              />
              <Input
                type="date"
                label={t("fields.to")}
                value={editTenant.until}
                onChange={(event) => setEditTenant((current) => current ? { ...current, until: event.target.value } : current)}
                disabled={tenantEditLoading}
                className="h-9 rounded-lg px-3 py-1.5"
              />
              <label className="flex h-9 items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={editTenant.canViewDocuments}
                  onChange={(event) => setEditTenant((current) => current ? { ...current, canViewDocuments: event.target.checked } : current)}
                  disabled={tenantEditLoading}
                />
                {t("fields.documentsAccess")}
              </label>
              <div className="sm:col-span-2">
                <input
                  ref={editTenantContractInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={(event) => setEditTenantContractFile(event.target.files?.[0] ?? null)}
                  disabled={tenantEditLoading}
                  className="sr-only"
                  id="edit-tenant-contract-file"
                />
                <label
                  htmlFor="edit-tenant-contract-file"
                  className="flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 transition hover:border-blue-300 hover:bg-blue-50"
                >
                  <span className="flex min-w-0 items-center gap-2 font-medium">
                    <FiPaperclip className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
                    <span className="truncate">{t("actions.replaceContract")}</span>
                  </span>
                  <span className="min-w-0 truncate text-right text-slate-500">
                    {editTenantContractFile ? editTenantContractFile.name : documentsT("fields.fileTypes")}
                  </span>
                </label>
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setEditTenant(null);
                  setEditTenantContractFile(null);
                  if (editTenantContractInputRef.current) editTenantContractInputRef.current.value = "";
                }}
                disabled={tenantEditLoading}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                {t("actions.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void handleSaveTenant()}
                disabled={tenantEditLoading}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                {tenantEditLoading ? t("actions.saving") : t("actions.save")}
              </button>
            </div>
          </>
        )}
      </Modal>

      {alert && (
        <AlertModal
          open={!!alert}
          onClose={() => setAlert(null)}
          title={alert.title}
          variant={alert.variant}
          onConfirm={async () => {
            await alert.onConfirm();
            setAlert(null);
          }}
          confirmLabel={t("alerts.confirm")}
          cancelLabel={t("alerts.cancel")}
        >
          {alert.message}
        </AlertModal>
      )}
    </div>
  );
}
