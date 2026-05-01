"use client";

import { useState } from "react";
import { AlertModal } from "@/components/ui/alert-modal";
import { DataTable } from "@/components/data-table";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inviteApartmentTenant, removeApartmentTenant, updateApartmentOwner, resendOwnerInvitation } from "@/shared/api/apartments";
import { useNotifications } from "@/shared/hooks/use-notifications";
import { FiMoreVertical, FiTrash2 } from "react-icons/fi";

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
};

export function TenantAccessManager({ apartmentId, apartmentLabel, compact = false, companyEmail, ownerData, inviteHistory = [], tenants, tenantsTitle, tenantRows, tenantColumns }: TenantAccessManagerProps) {
  const t = useTranslations("apartments.tenantAccess");

  const formatPossibleDate = (date: unknown): string => {
    if (!date) return "—";
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
    return "—";
  };

  // Для динамического рендера строк с действиями
  const [tenantsState, setTenantsState] = useState(tenants ?? []);
  const router = useRouter();
  const notifications = useNotifications();
  const [tab, setTab] = useState<'owner' | 'tenants'>("owner");
  const [alert, setAlert] = useState<null | { type: 'delete' | 'resend', onConfirm: () => void, title: string, message: string, variant?: 'warning' | 'error' | 'info' | 'success' }>(null);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [perpetual, setPerpetual] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ownerActionsOpen, setOwnerActionsOpen] = useState(false);

  // Owner form fields
  const [ownerFirstName, setOwnerFirstName] = useState("");
  const [ownerLastName, setOwnerLastName] = useState("");
  const [ownerContractNumber, setOwnerContractNumber] = useState("");
  const [ownerContractFile, setOwnerContractFile] = useState<File | null>(null);
  const [isOwnerDeleted, setIsOwnerDeleted] = useState(false);
  const [editOwnerModal, setEditOwnerModal] = useState(false);
  const [editOwnerEmail, setEditOwnerEmail] = useState("");
  const [editOwnerFirstName, setEditOwnerFirstName] = useState("");
  const [editOwnerLastName, setEditOwnerLastName] = useState("");
  const [editOwnerContractNumber, setEditOwnerContractNumber] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  const [localOwner, setLocalOwner] = useState(ownerData ?? {
    email: "—",
    activated: false,
    invitedAt: "—",
  });

  async function handleInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      notifications.error(t("errors.emailRequired"));
      return;
    }
    setLoading(true);
    try {
      await updateApartmentOwner(apartmentId, normalizedEmail, {
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
      setIsOwnerDeleted(false);
      setLocalOwner({
        email: normalizedEmail,
        activated: false,
        invitedAt: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  }

  function openEditOwnerModal() {
    setEditOwnerEmail(localOwner.email === "—" ? "" : String(localOwner.email));
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
      await updateApartmentOwner(apartmentId, normalizedEmail, {
        firstName: editOwnerFirstName.trim(),
        lastName: editOwnerLastName.trim(),
        contractNumber: editOwnerContractNumber.trim(),
      });
      notifications.success(t("alerts.updateSuccess") || "Обновлено");
      setLocalOwner({
        email: normalizedEmail,
        activated: localOwner.activated,
        invitedAt: new Date().toISOString(),
      });
      setEditOwnerModal(false);
      router.refresh();
    } catch {
      notifications.error(t("alerts.updateError") || "Ошибка обновления");
    } finally {
      setEditLoading(false);
    }
  }

  if (compact) {
    return <div>Управление владельцем недоступно в compact-режиме</div>;
  }

  // Добавляем столбец "Действия" если tenantsState есть
  const columnsWithActions = tenantColumns ? [...tenantColumns, t("actions.delete")]: undefined;

  // Формируем строки с кнопкой удаления
  const rowsWithActions = Array.isArray(tenantsState) && tenantsState.length > 0
    ? tenantsState.map((tenant: any, idx: number) => {
        // tenantRows[idx] содержит остальные поля
        const baseRow = tenantRows && tenantRows[idx] ? [...tenantRows[idx]] : [];
        // Если baseRow пуст, построить его из tenant
        if (baseRow.length === 0) {
          const firstName = tenant?.firstName ?? "—";
          const lastName = tenant?.lastName ?? "—";
          baseRow.push(firstName, lastName, tenant?.email || "—", formatPossibleDate(tenant?.invitedAt), tenant?.until || "—", tenant?.permissions?.join(", ") || t("details.tenantTypeResident"));
        }
        const tenantId = tenant?.userId || "";
        return [
          ...baseRow,
          <button
            key={`delete-tenant-${tenantId}-${idx}`}
            title={t("actions.delete")}
            className="text-red-600 hover:text-red-800"
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
            <FiTrash2 />
          </button>
        ];
      })
    : tenantRows;

  return (
    <div>
      <div className="mb-4 flex gap-2 border-b border-slate-200">
        <button
          className={`px-4 py-2 font-semibold ${tab === "owner" ? "border-b-2 border-blue-600 text-blue-700" : "text-slate-500"}`}
          onClick={() => setTab("owner")}
        >{t("tabs.owner")}</button>
        <button
          className={`px-4 py-2 font-semibold ${tab === "tenants" ? "border-b-2 border-blue-600 text-blue-700" : "text-slate-500"}`}
          onClick={() => setTab("tenants")}
        >{t("tabs.tenants")}</button>
      </div>
      {tab === "owner" && (
        <div className="space-y-6">
          {/* Форма приглашения владельца */}
          <form onSubmit={handleInvite} className="rounded-2xl border border-blue-200 bg-blue-50 p-4 flex flex-col md:flex-row md:flex-wrap gap-4 md:items-end">
            <Input
              type="text"
              label="Имя владельца"
              placeholder="Иван"
              value={ownerFirstName}
              onChange={(event) => setOwnerFirstName(event.target.value)}
              disabled={loading}
              className="flex-1 min-w-0"
            />
            <Input
              type="text"
              label="Фамилия владельца"
              placeholder="Петров"
              value={ownerLastName}
              onChange={(event) => setOwnerLastName(event.target.value)}
              disabled={loading}
              className="flex-1 min-w-0"
            />
            <Input
              type="email"
              label="Email владельца"
              placeholder="owner@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={loading}
              className="flex-1 min-w-0"
            />
            <Input
              type="text"
              label="Номер договора"
              placeholder="12345"
              value={ownerContractNumber}
              onChange={(event) => setOwnerContractNumber(event.target.value)}
              disabled={loading}
              className="flex-1 min-w-0"
            />
            <div className="flex-1 min-w-0">
              <label className="block text-sm font-medium text-slate-700 mb-1">Договор</label>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                onChange={(event) => setOwnerContractFile(event.target.files?.[0] || null)}
                disabled={loading}
                className="block w-full text-sm text-slate-500"
              />
            </div>
            <Button type="submit" disabled={loading || !email.trim()} className="h-10 min-w-30">
              {loading ? "Отправка..." : "Пригласить"}
            </Button>
          </form>

          {/* Таблица владельца - показывать только если владелец существует */}
          {localOwner.email && 
           localOwner.email !== "—" && 
           !localOwner.email.includes("не указано") && 
           !localOwner.email.includes("Не указано") &&
           localOwner.email.includes("@") && (
          <div>
            <div className="mb-2 font-semibold text-slate-700">Текущий владелец</div>
            <DataTable
              columns={["Email", "Статус", "Дата приглашения", "Действия"]}
              rows={[ [
                localOwner.email,
                isOwnerDeleted 
                  ? <span className="text-red-600 font-semibold">Удален</span>
                  : localOwner.activated ? <span className="text-emerald-700">{t("owner.activated")}</span> : <span className="text-amber-600">{t("owner.notActivated")}</span>,
                formatPossibleDate(localOwner.invitedAt),
                isOwnerDeleted 
                  ? <span className="text-slate-400">—</span>
                  : <div className="relative" key="owner-actions">
                      <button
                        title="Действия"
                        className="text-amber-500 hover:text-amber-700 p-2 relative"
                        type="button"
                        onClick={() => setOwnerActionsOpen(!ownerActionsOpen)}
                      >
                        <FiMoreVertical size={20} />
                      </button>
                      {ownerActionsOpen && (
                        <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-50">
                          <button
                            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-blue-50 border-b border-slate-100"
                            type="button"
                            onClick={() => {
                              setOwnerActionsOpen(false);
                              setAlert({
                                type: 'resend',
                                title: t("alerts.resendConfirmTitle"),
                                message: t("alerts.resendConfirm"),
                                variant: 'info',
                                onConfirm: async () => {
                                  try {
                                    await resendOwnerInvitation(apartmentId, localOwner.email);
                                    notifications.success(t("alerts.resendSuccess"));
                                  } catch {
                                    notifications.error(t("alerts.resendError"));
                                  }
                                }
                              });
                            }}
                          >
                            {t("actions.resend")}
                          </button>
                          <button
                            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-blue-50 border-b border-slate-100"
                            type="button"
                            onClick={() => {
                              setOwnerActionsOpen(false);
                              openEditOwnerModal();
                            }}
                          >
                            {t("actions.edit")}
                          </button>
                          <button
                            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                            type="button"
                            onClick={() => {
                              setOwnerActionsOpen(false);
                              setAlert({
                                type: 'delete',
                                title: t("alerts.deleteConfirmTitle"),
                                message: t("alerts.deleteConfirm"),
                                variant: 'warning',
                                onConfirm: async () => {
                                  try {
                                    const ownerIdToDelete = localOwner.userId || localOwner.email;
                                    await removeApartmentTenant(apartmentId, ownerIdToDelete);
                                    setIsOwnerDeleted(true);
                                    notifications.success(t("alerts.deleteSuccess"));
                                    router.refresh();
                                  } catch {
                                    notifications.error(t("alerts.deleteError"));
                                  }
                                }
                              });
                            }}
                          >
                            {t("actions.delete")}
                          </button>
                        </div>
                      )}
                    </div>
              ] ]}
            />
          </div>
          )}
        </div>
      )}
      {tab === "tenants" && (
        <div className="space-y-4">
          {/* Форма добавления арендатора */}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const normalizedEmail = email.trim().toLowerCase();
              if (!normalizedEmail) {
                notifications.error(t("errors.emailRequired"));
                return;
              }

              // Проверка что email не совпадает с email управляющей компании
              if (companyEmail && companyEmail !== "—" && normalizedEmail === companyEmail.toLowerCase()) {
                notifications.error(t("errors.emailCantBeCompanyEmail"));
                return;
              }

              // Проверка что email не совпадает с email владельца
              if (ownerData && typeof ownerData === 'object' && 'email' in ownerData && ownerData.email && ownerData.email !== "—" && normalizedEmail === (ownerData.email as string).toLowerCase()) {
                notifications.error(t("errors.emailCantBeOwnerEmail"));
                return;
              }

              // Проверка что email не совпадает ни с одним арендатором
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
                });
                notifications.success(t("success.invited", { email: normalizedEmail, apartment: apartmentLabel }));
                setEmail("");
                setFirstName("");
                setLastName("");
                setPhone("");
                setFromDate("");
                setToDate("");
                setPerpetual(false);
                // Обновляем tenantsState
                setTenantsState((prev: any[]) => [...prev, { 
                  email: normalizedEmail,
                  name: `${firstName} ${lastName}`.trim(),
                  firstName: firstName,
                  lastName: lastName,
                  phone: phone,
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
            className="rounded-2xl border border-blue-200 bg-blue-50 p-4 flex flex-col md:flex-row md:flex-wrap gap-4 md:items-end"
          >
            <Input
              type="text"
              label={t("fields.firstName")}
              placeholder={t("placeholders.firstName")}
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              disabled={loading}
              className="flex-1 min-w-0"
            />
            <Input
              type="text"
              label={t("fields.lastName")}
              placeholder={t("placeholders.lastName")}
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              disabled={loading}
              className="flex-1 min-w-0"
            />
            <Input
              type="tel"
              label={t("fields.phone")}
              placeholder={t("placeholders.phone")}
              value={phone}
              onChange={e => setPhone(e.target.value)}
              disabled={loading}
              className="flex-1 min-w-0"
            />
            <Input
              type="email"
              label={t("fields.email")}
              placeholder={t("placeholders.email")}
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={loading}
              className="flex-1 min-w-0"
            />
            <Input
              type="date"
              label={t("fields.from")}
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              disabled={loading}
              className="flex-1 min-w-0"
            />
            <Input
              type="date"
              label={t("fields.to")}
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              disabled={loading || perpetual}
              className="flex-1 min-w-0"
            />
            <label className="flex items-center gap-2 min-w-0">
              <input
                type="checkbox"
                checked={perpetual}
                onChange={e => setPerpetual(e.target.checked)}
                disabled={loading}
              />
              {t("fields.perpetual")}
            </label>
            <Button type="submit" disabled={loading || !email.trim() || !firstName.trim() || !lastName.trim()} className="h-10 min-w-30">
              {loading ? t("actions.adding") : t("actions.addTenant")}
            </Button>
          </form>
          {tenantsTitle && rowsWithActions && rowsWithActions.length > 0 && rowsWithActions[0][0] !== "—" && (
            <>
              <h3 className="text-2xl font-semibold text-slate-900">{tenantsTitle}</h3>
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
            <h3 className="text-lg font-semibold mb-4">Редактирование владельца</h3>
            <div className="space-y-4">
              <Input
                type="email"
                label="Email владельца"
                placeholder="owner@example.com"
                value={editOwnerEmail}
                onChange={(e) => setEditOwnerEmail(e.target.value)}
                disabled={editLoading}
              />
              <Input
                type="text"
                label="Имя владельца"
                placeholder="Иван"
                value={editOwnerFirstName}
                onChange={(e) => setEditOwnerFirstName(e.target.value)}
                disabled={editLoading}
              />
              <Input
                type="text"
                label="Фамилия владельца"
                placeholder="Петров"
                value={editOwnerLastName}
                onChange={(e) => setEditOwnerLastName(e.target.value)}
                disabled={editLoading}
              />
              <Input
                type="text"
                label="Номер договора"
                placeholder="12345"
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
                Отмена
              </button>
              <button
                onClick={handleSaveOwner}
                disabled={editLoading}
                className="flex-1 px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {editLoading ? "Сохранение..." : "Сохранить"}
              </button>
            </div>
          </div>
        </div>
      )}

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
