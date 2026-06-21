"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { FaEye, FaInfoCircle, FaRegUser } from "react-icons/fa";
import {
  FiChevronDown,
  FiCopy,
  FiExternalLink,
  FiLock,
  FiPlus,
  FiSearch,
  FiTrash2,
  FiX,
} from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { changeAccountEmail, changeAccountPassword, saveUserProfile } from "@/shared/api/auth";
import {
  addCompanyMember,
  createCompanyApiKey,
  removeCompanyMember,
  revokeCompanyApiKey,
  type CompanyApiKeyItem,
  updateCompany,
} from "@/shared/api/company";
import { type NotificationSettings, updateNotificationSettings } from "@/shared/api/notifications";
import { useNotifications } from "@/shared/hooks/use-notifications";
import { isStrongPassword } from "@/shared/lib/password-validation";

type SettingsTab = "user" | "company" | "apiKey" | "notifications" | "contacts" | "billing" | "additionalUsers" | "dataManagement";

type UserSettings = {
  userId: string;
  userName: string;
  email: string;
  username: string;
  phone: string;
  personalCode: string;
};

type CompanySettings = {
  canManage: boolean;
  companyId: string;
  name: string;
  registrationNumber: string;
  email: string;
  phone: string;
  apiKeys: CompanyApiKeyItem[];
  buildings: CompanyAccessBuilding[];
  members: CompanyMember[];
};

type CompanyAccessBuilding = {
  id: string;
  name: string;
  address: string;
};

type CompanyMember = {
  id: string;
  email: string;
  name: string;
  phone?: string;
  position?: string;
  comment?: string;
  showContactToResidents?: boolean;
  createAccount?: boolean;
  role: string;
};

type SettingsTabsProps = {
  user: UserSettings;
  notificationSettings: NotificationSettings;
  company?: CompanySettings;
};

type EditableField = "email" | "name" | "phone" | "password" | null;
type EditableCompanyField = "name" | "registrationNumber" | "email" | "phone" | null;

type NameDraft = {
  firstName: string;
  lastName: string;
};

type PasswordDraft = {
  current: string;
  next: string;
  repeat: string;
};

type VisiblePasswordField = keyof PasswordDraft;
type CompanyDraft = Pick<CompanySettings, "companyId" | "name" | "registrationNumber" | "email" | "phone">;
type CompanyMemberRole = "ManagementCompany" | "Accountant";

const baseTabs: SettingsTab[] = ["user", "notifications"];

function SettingsRow({
  label,
  value,
  withInfo = false,
  onEdit,
}: {
  label: string;
  value: string;
  withInfo?: boolean;
  onEdit?: () => void;
}) {
  const t = useTranslations("settings");

  return (
    <div className="grid gap-3 border-t border-slate-200 py-6 sm:grid-cols-[1fr_auto] sm:items-start">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-base font-semibold text-black">{label}</p>
          {withInfo ? <FaInfoCircle className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" /> : null}
        </div>
        <p className="mt-2 break-words text-base leading-6 text-slate-700">{value}</p>
      </div>
      {onEdit ? (
        <Button
          type="button"
          variant="inlineLink"
          size="link"
          onClick={onEdit}
          className="justify-self-start font-semibold leading-5 sm:justify-self-end"
        >
          {t("actions.edit")}
        </Button>
      ) : null}
    </div>
  );
}

function EmailEditRow({
  value,
  disabled = false,
  feedback,
  feedbackTone = "error",
  onChange,
  onCancel,
  onSave,
}: {
  value: string;
  disabled?: boolean;
  feedback?: string;
  feedbackTone?: "error" | "success";
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const t = useTranslations("settings");

  return (
    <form
      className="grid gap-4 border-t border-slate-200 py-6 sm:grid-cols-[1fr_auto] sm:items-start"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <label htmlFor="settings-email" className="text-base font-semibold text-black">
            {t("fields.email")}
          </label>
          <FaInfoCircle className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
        </div>
        <p className="mt-2 text-base leading-6 text-black">{t("emailHint")}</p>
        <input
          id="settings-email"
          type="email"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1.5 h-11 w-full max-w-[308px] rounded-lg border border-slate-300 bg-white px-3 text-base text-black outline-none transition focus:border-black focus:ring-2 focus:ring-black/10"
        />
        {feedback ? (
          <p className={`mt-2 max-w-md text-sm font-medium ${feedbackTone === "success" ? "text-emerald-700" : "text-red-600"}`}>
            {feedback}
          </p>
        ) : null}
        <Button
          type="submit"
          variant="dark"
          size="pill"
          disabled={disabled}
          className="mt-4 font-bold leading-5"
        >
          {t("actions.save")}
        </Button>
      </div>
      <Button
        type="button"
        variant="inlineLink"
        size="link"
        onClick={onCancel}
        disabled={disabled}
        className="justify-self-start font-semibold leading-5 sm:justify-self-end"
      >
        {t("actions.cancel")}
      </Button>
    </form>
  );
}

function splitDisplayName(value: string): NameDraft {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };

  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

function NameEditRow({
  value,
  disabled = false,
  feedback,
  feedbackTone = "error",
  onChange,
  onCancel,
  onSave,
}: {
  value: NameDraft;
  disabled?: boolean;
  feedback?: string;
  feedbackTone?: "error" | "success";
  onChange: (field: keyof NameDraft, value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const t = useTranslations("settings");

  return (
    <form
      className="grid gap-4 border-t border-slate-200 py-6 sm:grid-cols-[1fr_auto] sm:items-start"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-black">{t("fields.username")}</h3>
        <div className="mt-3 grid max-w-[420px] gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-black">{t("fields.firstName")}*</span>
            <input
              type="text"
              value={value.firstName}
              disabled={disabled}
              onChange={(event) => onChange("firstName", event.target.value)}
              className="h-[46px] w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-black outline-none transition focus:border-black focus:ring-2 focus:ring-black/10"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-black">{t("fields.lastName")}*</span>
            <input
              type="text"
              value={value.lastName}
              disabled={disabled}
              onChange={(event) => onChange("lastName", event.target.value)}
              className="h-[46px] w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-black outline-none transition focus:border-black focus:ring-2 focus:ring-black/10"
            />
          </label>
        </div>
        {feedback ? (
          <p className={`mt-2 max-w-md text-sm font-medium ${feedbackTone === "success" ? "text-emerald-700" : "text-red-600"}`}>
            {feedback}
          </p>
        ) : null}
        <Button
          type="submit"
          variant="dark"
          size="pill"
          disabled={disabled}
          className="mt-4 font-bold leading-5"
        >
          {t("actions.save")}
        </Button>
      </div>
      <Button
        type="button"
        variant="inlineLink"
        size="link"
        onClick={onCancel}
        disabled={disabled}
        className="justify-self-start font-semibold leading-5 sm:justify-self-end"
      >
        {t("actions.cancel")}
      </Button>
    </form>
  );
}

function PhoneEditRow({
  value,
  disabled = false,
  feedback,
  feedbackTone = "error",
  label,
  placeholder,
  saveLabel,
  cancelLabel,
  onChange,
  onCancel,
  onSave,
}: {
  value: string;
  disabled?: boolean;
  feedback?: string;
  feedbackTone?: "error" | "success";
  label: string;
  placeholder: string;
  saveLabel: string;
  cancelLabel: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <form
      className="grid gap-4 border-t border-slate-200 py-6 sm:grid-cols-[1fr_auto] sm:items-start"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <div className="min-w-0">
        <label htmlFor="settings-phone" className="text-base font-semibold text-black">
          {label}
        </label>
        <input
          id="settings-phone"
          type="tel"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="mt-3 h-[46px] w-full max-w-[308px] rounded-lg border border-slate-300 bg-white px-3 text-base text-black outline-none transition placeholder:text-slate-400 focus:border-black focus:ring-2 focus:ring-black/10"
        />
        {feedback ? (
          <p className={`mt-2 max-w-md text-sm font-medium ${feedbackTone === "success" ? "text-emerald-700" : "text-red-600"}`}>
            {feedback}
          </p>
        ) : null}
        <Button
          type="submit"
          variant="dark"
          size="pill"
          disabled={disabled}
          className="mt-4 font-bold leading-5"
        >
          {saveLabel}
        </Button>
      </div>
      <Button
        type="button"
        variant="inlineLink"
        size="link"
        onClick={onCancel}
        disabled={disabled}
        className="justify-self-start font-semibold leading-5 sm:justify-self-end"
      >
        {cancelLabel}
      </Button>
    </form>
  );
}

function PasswordInput({
  id,
  label,
  placeholder,
  value,
  visible,
  disabled = false,
  withInfo = false,
  onChange,
  onToggleVisible,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  visible: boolean;
  disabled?: boolean;
  withInfo?: boolean;
  onChange: (value: string) => void;
  onToggleVisible: () => void;
}) {
  const t = useTranslations("settings");

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        <label htmlFor={id} className="text-sm font-semibold text-black">
          {label}
        </label>
        {withInfo ? <FaInfoCircle className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" /> : null}
      </div>
      <div className="relative w-full max-w-[308px]">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="h-[46px] w-full rounded-lg border border-slate-300 bg-white py-3 pl-3 pr-11 text-base text-black outline-none transition placeholder:text-slate-400 focus:border-black focus:ring-2 focus:ring-black/10"
        />
        <Button
          type="button"
          variant="plain"
          size="icon"
          onClick={onToggleVisible}
          disabled={disabled}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-black"
          aria-label={visible ? t("actions.hidePassword") : t("actions.showPassword")}
        >
          <FaEye className="h-5 w-5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function PasswordEditRow({
  value,
  visibleFields,
  disabled = false,
  feedback,
  feedbackTone = "error",
  onChange,
  onCancel,
  onSave,
  onToggleVisible,
}: {
  value: PasswordDraft;
  visibleFields: Record<VisiblePasswordField, boolean>;
  disabled?: boolean;
  feedback?: string;
  feedbackTone?: "error" | "success";
  onChange: (field: keyof PasswordDraft, value: string) => void;
  onCancel: () => void;
  onSave: () => void;
  onToggleVisible: (field: VisiblePasswordField) => void;
}) {
  const t = useTranslations("settings");

  return (
    <form
      className="grid gap-4 border-t border-slate-200 py-6 sm:grid-cols-[1fr_auto] sm:items-start"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-black">{t("fields.password")}</h3>
        <div className="mt-3 space-y-4">
          <PasswordInput
            id="settings-current-password"
            label={t("fields.currentPasswordRequired")}
            placeholder={t("placeholders.currentPassword")}
            value={value.current}
            visible={visibleFields.current}
            disabled={disabled}
            onChange={(nextValue) => onChange("current", nextValue)}
            onToggleVisible={() => onToggleVisible("current")}
          />
          <PasswordInput
            id="settings-new-password"
            label={t("fields.newPasswordRequired")}
            placeholder={t("placeholders.newPassword")}
            value={value.next}
            visible={visibleFields.next}
            disabled={disabled}
            withInfo
            onChange={(nextValue) => onChange("next", nextValue)}
            onToggleVisible={() => onToggleVisible("next")}
          />
          <PasswordInput
            id="settings-repeat-password"
            label={t("fields.repeatPasswordRequired")}
            placeholder={t("placeholders.repeatPassword")}
            value={value.repeat}
            visible={visibleFields.repeat}
            disabled={disabled}
            onChange={(nextValue) => onChange("repeat", nextValue)}
            onToggleVisible={() => onToggleVisible("repeat")}
          />
        </div>
        {feedback ? (
          <p className={`mt-2 max-w-md text-sm font-medium ${feedbackTone === "success" ? "text-emerald-700" : "text-red-600"}`}>
            {feedback}
          </p>
        ) : null}
        <Button
          type="submit"
          variant="dark"
          size="pill"
          disabled={disabled}
          className="mt-4 font-bold leading-5"
        >
          {t("actions.save")}
        </Button>
      </div>
      <Button
        type="button"
        variant="inlineLink"
        size="link"
        onClick={onCancel}
        disabled={disabled}
        className="justify-self-start font-semibold leading-5 sm:justify-self-end"
      >
        {t("actions.cancel")}
      </Button>
    </form>
  );
}

function NotificationToggle({
  checked,
  disabled = false,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex h-8 w-14 items-center rounded-full p-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 ${
        checked ? "bg-blue-500" : "bg-slate-300"
      }`}
    >
      <span
        className={`h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-6" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function NotificationSettingRow({
  checked,
  disabled = false,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="grid gap-4 border-t border-slate-200 py-6 sm:grid-cols-[1fr_auto] sm:items-center">
      <p className="text-base font-semibold text-black">{label}</p>
      <NotificationToggle checked={checked} disabled={disabled} label={label} onChange={onChange} />
    </div>
  );
}

function NotificationsPanel({ initialSettings }: { initialSettings: NotificationSettings }) {
  const t = useTranslations("settings");
  const notify = useNotifications();
  const [settings, setSettings] = useState<NotificationSettings>(initialSettings);
  const [isSaving, setIsSaving] = useState(false);

  const saveSettings = async (nextSettings: NotificationSettings) => {
    const previousSettings = settings;
    setSettings(nextSettings);
    setIsSaving(true);

    try {
      const result = await updateNotificationSettings(nextSettings);
      setSettings(result.settings);
      notify.success(t("toast.notificationSettingsSaved"));
    } catch (error) {
      setSettings(previousSettings);
      notify.error(error instanceof Error ? error.message : t("errors.notificationSettingsSaveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  const updateSetting = <Key extends keyof NotificationSettings>(key: Key, value: NotificationSettings[Key]) => {
    void saveSettings({ ...settings, [key]: value });
  };

  return (
    <div className="py-7">
      <h2 className="text-xl font-bold leading-7 text-black">{t("notifications.title")}</h2>

      <div className="mt-7">
        <NotificationSettingRow
          checked={settings.general}
          disabled={isSaving}
          label={t("notifications.general")}
          onChange={(checked) => updateSetting("general", checked)}
        />
        <NotificationSettingRow
          checked={settings.meterReminder}
          disabled={isSaving || !settings.general}
          label={t("notifications.meterReminder")}
          onChange={(checked) => updateSetting("meterReminder", checked)}
        />
        <NotificationSettingRow
          checked={settings.paymentReminder}
          disabled={isSaving || !settings.general}
          label={t("notifications.paymentReminder")}
          onChange={(checked) => updateSetting("paymentReminder", checked)}
        />

        <label className="grid gap-4 border-t border-slate-200 py-6 sm:grid-cols-[1fr_auto] sm:items-center">
          <span className="text-base font-semibold text-black">{t("notifications.language")}</span>
          <select
            value={settings.language}
            disabled={isSaving}
            onChange={(event) => updateSetting("language", event.target.value as NotificationSettings["language"])}
            className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base leading-6 text-black outline-none transition focus:border-black focus:ring-2 focus:ring-black/10 sm:w-56"
          >
            <option value="ru">{t("languages.ru")}</option>
            <option value="lv">{t("languages.lv")}</option>
            <option value="en">{t("languages.en")}</option>
          </select>
        </label>
      </div>
    </div>
  );
}

function TextEditRow({
  id,
  label,
  value,
  type = "text",
  disabled = false,
  feedback,
  feedbackTone = "error",
  onChange,
  onCancel,
  onSave,
}: {
  id: string;
  label: string;
  value: string;
  type?: "text" | "email" | "tel";
  disabled?: boolean;
  feedback?: string;
  feedbackTone?: "error" | "success";
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const t = useTranslations("settings");

  return (
    <form
      className="grid gap-4 border-t border-slate-200 py-6 sm:grid-cols-[1fr_auto] sm:items-start"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <div className="min-w-0">
        <label htmlFor={id} className="text-base font-semibold text-black">
          {label}
        </label>
        <input
          id={id}
          type={type}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="mt-3 h-[46px] w-full max-w-[360px] rounded-lg border border-slate-300 bg-white px-3 text-base text-black outline-none transition focus:border-black focus:ring-2 focus:ring-black/10"
        />
        {feedback ? (
          <p className={`mt-2 max-w-md text-sm font-medium ${feedbackTone === "success" ? "text-emerald-700" : "text-red-600"}`}>
            {feedback}
          </p>
        ) : null}
        <Button type="submit" variant="dark" size="pill" disabled={disabled} className="mt-4 font-bold leading-5">
          {t("actions.save")}
        </Button>
      </div>
      <Button
        type="button"
        variant="inlineLink"
        size="link"
        onClick={onCancel}
        disabled={disabled}
        className="justify-self-start font-semibold leading-5 sm:justify-self-end"
      >
        {t("actions.cancel")}
      </Button>
    </form>
  );
}

type ApiKeyOwnerType = "user" | "service";
type ApiKeyPermission = "all" | "restricted" | "read";
type UsageSection = "connection" | "batch" | "fields" | "rules" | "example" | "responses";

function formatApiKeyDate(value: string | null, emptyLabel: string) {
  if (!value) return emptyLabel;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function normalizeApiKeyPermission(value: string): ApiKeyPermission {
  if (value === "restricted" || value === "read") return value;
  return "all";
}

function ApiKeyPanel({
  companyId,
  createdByName,
  buildings,
  initialKeys,
}: {
  companyId: string;
  createdByName: string;
  buildings: CompanyAccessBuilding[];
  initialKeys: CompanyApiKeyItem[];
}) {
  const t = useTranslations("settings");
  const notify = useNotifications();
  const [keys, setKeys] = useState<CompanyApiKeyItem[]>(initialKeys);
  const [search, setSearch] = useState("");
  const [isUsageOpen, setIsUsageOpen] = useState(false);
  const [openUsageSections, setOpenUsageSections] = useState<Record<UsageSection, boolean>>({
    connection: true,
    batch: false,
    fields: false,
    rules: false,
    example: false,
    responses: false,
  });
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSaveOpen, setIsSaveOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [selectedBuildingId, setSelectedBuildingId] = useState(() => buildings[0]?.id ?? "");
  const [ownerType, setOwnerType] = useState<ApiKeyOwnerType>("user");
  const [permission, setPermission] = useState<ApiKeyPermission>("all");
  const [generatedKey, setGeneratedKey] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [pendingDeleteKey, setPendingDeleteKey] = useState<CompanyApiKeyItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const statusLabel = (status: string) => {
    if (["disabled", "inactive", "revoked"].includes(status.toLowerCase())) return t("apiKeys.statusRevoked");
    return t("apiKeys.statusActive");
  };

  const permissionLabel = (value: string) => {
    const normalized = normalizeApiKeyPermission(value);
    if (normalized === "restricted") return t("apiKeys.restricted");
    if (normalized === "read") return t("apiKeys.readOnly");
    return t("apiKeys.all");
  };
  const selectedBuilding = buildings.find((building) => building.id === selectedBuildingId) ?? buildings[0] ?? null;

  const usageFields = [
    { name: "file", description: t("apiKeys.usageFields.file") },
    { name: "buildingId", description: t("apiKeys.usageFields.buildingId"), optional: true },
    { name: "apartmentId", description: t("apiKeys.usageFields.apartmentId"), optional: true },
    { name: "apartmentNumber", description: t("apiKeys.usageFields.apartmentNumber"), optional: true },
    { name: "contractNumber", description: t("apiKeys.usageFields.contractNumber"), optional: true },
    { name: "period", description: t("apiKeys.usageFields.period") },
    { name: "invoiceDate", description: t("apiKeys.usageFields.invoiceDate") },
    { name: "amount", description: t("apiKeys.usageFields.amount") },
    { name: "currency", description: t("apiKeys.usageFields.currency") },
    { name: "externalId", description: t("apiKeys.usageFields.externalId") },
    { name: "status", description: t("apiKeys.usageFields.status") },
    { name: "comment", description: t("apiKeys.usageFields.comment"), optional: true },
  ];

  const toggleUsageSection = (section: UsageSection) => {
    setOpenUsageSections((current) => ({ ...current, [section]: !current[section] }));
  };

  const visibleKeys = keys.filter((item) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;

    return [item.label, item.trackingId, item.keyPrefix]
      .some((value) => value.toLowerCase().includes(needle));
  });

  const generateKey = async () => {
    const name = draftName.trim();
    if (!name) {
      notify.error(t("apiKeys.nameRequired"));
      return;
    }

    if (!selectedBuildingId) {
      notify.error(t("apiKeys.buildingRequired"));
      return;
    }

    setIsGenerating(true);

    try {
      const result = await createCompanyApiKey(companyId, {
        label: name,
        buildingId: selectedBuildingId,
        ownerType,
        permission,
      });
      setGeneratedKey(result.apiKey);
      setKeys((current) => [result.item, ...current.filter((item) => item.id !== result.item.id)]);
      setDraftName("");
      setSelectedBuildingId(buildings[0]?.id ?? "");
      setOwnerType("user");
      setPermission("all");
      setIsCreateOpen(false);
      setIsSaveOpen(true);
      notify.success(t("apiKeys.toastCreated"));
    } catch (error) {
      notify.error(error instanceof Error ? error.message : t("apiKeys.createFailed"));
    } finally {
      setIsGenerating(false);
    }
  };

  const copyGeneratedKey = async () => {
    if (!generatedKey) return;

    try {
      await navigator.clipboard.writeText(generatedKey);
      notify.success(t("apiKeys.copied"));
    } catch {
      notify.error(t("apiKeys.copyFailed"));
    }
  };

  const deleteKey = async () => {
    const item = pendingDeleteKey;
    if (!item) return;

    setDeletingId(item.id);

    try {
      await revokeCompanyApiKey(companyId, item.id);
      setKeys((current) => current.filter((key) => key.id !== item.id));
      setPendingDeleteKey(null);
      notify.success(t("apiKeys.toastDeleted"));
    } catch (error) {
      notify.error(error instanceof Error ? error.message : t("apiKeys.deleteFailed"));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="py-7">
      <h2 className="text-2xl font-bold leading-8 text-black">{t("apiKeys.title")}</h2>

      <div className="mt-5 flex flex-wrap items-center gap-5 border-b border-slate-200">
        <button type="button" className="border-b border-black pb-3 text-sm font-bold text-black">
          {t("apiKeys.projectTab")}
        </button>
        <button type="button" className="pb-3 text-sm font-semibold text-slate-500">
          {t("apiKeys.userTab")}
        </button>
        <span className="mb-3 rounded bg-orange-100 px-2 py-1 text-xs font-bold text-orange-700">
          {t("apiKeys.legacy")}
        </span>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <FiLock className="h-5 w-5 text-slate-500" aria-hidden="true" />
        <Button
          type="button"
          variant="outlineDark"
          size="pill"
          onClick={() => setIsUsageOpen(true)}
          className="h-10 gap-2 rounded-lg px-4 text-sm font-bold"
        >
          {t("apiKeys.usage")}
          <FiExternalLink className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="dark"
          size="pill"
          onClick={() => setIsCreateOpen(true)}
          className="h-10 gap-2 rounded-lg px-4 text-sm font-bold"
        >
          <FiPlus className="h-4 w-4" aria-hidden="true" />
          {t("apiKeys.createSecret")}
        </Button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label className="relative block w-full max-w-[310px]">
          <FiSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("apiKeys.search")}
            className="h-11 w-full rounded-full border border-slate-300 bg-white pl-11 pr-4 text-sm text-black outline-none transition placeholder:text-slate-500 focus:border-black focus:ring-2 focus:ring-black/10"
          />
        </label>
        <span className="text-sm font-semibold text-slate-500">
          {t("apiKeys.results", { count: visibleKeys.length })}
        </span>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-[1180px] w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
            <tr>
              <th className="px-4 py-3">{t("apiKeys.columns.name")}</th>
              <th className="px-4 py-3">{t("apiKeys.columns.status")}</th>
              <th className="px-4 py-3">{t("apiKeys.columns.trackingId")}</th>
              <th className="px-4 py-3">{t("apiKeys.columns.secretKey")}</th>
              <th className="px-4 py-3">{t("apiKeys.columns.created")}</th>
              <th className="px-4 py-3">{t("apiKeys.columns.lastUsed")}</th>
              <th className="px-4 py-3">{t("apiKeys.columns.createdBy")}</th>
              <th className="px-4 py-3">{t("apiKeys.columns.permissions")}</th>
              <th className="px-4 py-3 text-right">{t("apiKeys.columns.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {visibleKeys.length > 0 ? (
              visibleKeys.map((item) => {
                const isDeleting = deletingId === item.id;

                return (
                  <tr key={item.id} className="border-b border-slate-200 text-slate-700">
                    <td className="max-w-[190px] px-4 py-4 font-medium text-slate-700">
                      <span className="block truncate">{item.label}</span>
                    </td>
                    <td className="px-4 py-4">{statusLabel(item.status)}</td>
                    <td className="px-4 py-4 font-mono text-xs">{item.trackingId || `key_${item.id.slice(0, 16)}`}</td>
                    <td className="px-4 py-4 font-mono text-xs">{item.keyPrefix || "sk-..."}</td>
                    <td className="px-4 py-4">{formatApiKeyDate(item.createdAt, "-")}</td>
                    <td className="px-4 py-4">{formatApiKeyDate(item.lastUsedAt, t("apiKeys.never"))}</td>
                    <td className="px-4 py-4">{createdByName}</td>
                    <td className="px-4 py-4">
                      <span className="block">{permissionLabel(item.permission)}</span>
                      <span className="mt-1 block max-w-[180px] truncate text-xs text-slate-500">
                        {item.buildingName || item.buildingId || t("apiKeys.noBuilding")}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={() => setPendingDeleteKey(item)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-red-500 transition hover:bg-red-50 hover:text-red-600 disabled:pointer-events-none disabled:opacity-40"
                          aria-label={t("apiKeys.delete")}
                          title={t("apiKeys.delete")}
                        >
                          <FiTrash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm font-medium text-slate-500">
                  {t("apiKeys.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isCreateOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-8"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsCreateOpen(false);
          }}
        >
          <form
            className="relative w-full max-w-[560px] rounded-2xl bg-white p-6 shadow-2xl"
            onSubmit={(event) => {
              event.preventDefault();
              void generateKey();
            }}
          >
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="absolute right-5 top-5 inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-black"
              aria-label={t("apiKeys.close")}
            >
              <FiX className="h-5 w-5" aria-hidden="true" />
            </button>
            <h3 className="text-2xl font-bold text-black">{t("apiKeys.createTitle")}</h3>

            <div className="mt-4">
              <p className="text-base font-bold text-black">{t("apiKeys.ownedBy")}</p>
              <div className="mt-2 inline-flex rounded-lg bg-slate-100 p-1">
                {(["user", "service"] satisfies ApiKeyOwnerType[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setOwnerType(value)}
                    className={`h-10 rounded-md px-4 text-sm font-bold transition ${
                      ownerType === value ? "bg-white text-black shadow-sm" : "text-slate-600"
                    }`}
                  >
                    {value === "user" ? t("apiKeys.you") : t("apiKeys.serviceAccount")}
                  </button>
                ))}
              </div>
              <p className="mt-4 max-w-[470px] text-sm leading-6 text-slate-600">{t("apiKeys.ownedByHint")}</p>
            </div>

            <label className="mt-5 block">
              <span className="text-base font-bold text-black">
                {t("apiKeys.name")} <span className="font-medium text-slate-500">{t("apiKeys.required")}</span>
              </span>
              <input
                type="text"
                value={draftName}
                required
                disabled={isGenerating}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder={t("apiKeys.labelPlaceholder")}
                className="mt-3 h-11 w-full rounded-lg border border-slate-400 bg-white px-3 text-base text-black outline-none transition placeholder:text-slate-400 focus:border-black focus:ring-2 focus:ring-black/10"
              />
            </label>

            <label className="mt-6 block">
              <span className="text-base font-bold text-black">{t("apiKeys.buildingAccess")}</span>
              <div className="relative mt-3">
                <select
                  value={selectedBuildingId}
                  required
                  disabled={isGenerating || buildings.length === 0}
                  onChange={(event) => setSelectedBuildingId(event.target.value)}
                  className="h-11 w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 pr-10 text-base text-black outline-none"
                >
                  {buildings.length > 0 ? (
                    buildings.map((building) => (
                      <option key={building.id} value={building.id}>
                        {building.name || building.address || building.id}
                      </option>
                    ))
                  ) : (
                    <option value="">{t("apiKeys.noBuildingsAvailable")}</option>
                  )}
                </select>
                <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-600" aria-hidden="true" />
              </div>
              {selectedBuilding?.address ? (
                <p className="mt-2 text-sm leading-6 text-slate-500">{selectedBuilding.address}</p>
              ) : null}
            </label>

            <div className="mt-6">
              <p className="text-base font-bold text-black">{t("apiKeys.permissions")}</p>
              <div className="mt-3 inline-flex rounded-lg bg-slate-100 p-1">
                {(["all", "restricted", "read"] satisfies ApiKeyPermission[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPermission(value)}
                    className={`h-10 rounded-md px-4 text-sm font-bold transition ${
                      permission === value ? "bg-white text-black shadow-sm" : "text-slate-600"
                    }`}
                  >
                    {permissionLabel(value)}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-10 flex justify-end gap-3">
              <Button
                type="button"
                variant="plain"
                size="pill"
                disabled={isGenerating}
                onClick={() => setIsCreateOpen(false)}
                className="h-10 rounded-lg bg-slate-100 px-4 text-base font-medium hover:bg-slate-200"
              >
                {t("apiKeys.cancel")}
              </Button>
              <Button
                type="submit"
                variant="dark"
                size="pill"
                disabled={isGenerating || buildings.length === 0}
                className="h-10 rounded-lg px-4 text-base font-bold"
              >
                {isGenerating ? t("apiKeys.generating") : t("apiKeys.createSecretKey")}
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {pendingDeleteKey ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-8"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deletingId) setPendingDeleteKey(null);
          }}
        >
          <div className="relative w-full max-w-[560px] rounded-2xl bg-white p-6 shadow-2xl">
            <button
              type="button"
              disabled={Boolean(deletingId)}
              onClick={() => setPendingDeleteKey(null)}
              className="absolute right-5 top-5 inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-black disabled:pointer-events-none disabled:opacity-50"
              aria-label={t("apiKeys.close")}
            >
              <FiX className="h-5 w-5" aria-hidden="true" />
            </button>
            <h3 className="text-2xl font-bold text-black">{t("apiKeys.revokeTitle")}</h3>
            <p className="mt-5 max-w-[500px] text-base leading-7 text-slate-700">{t("apiKeys.revokeWarning")}</p>
            <input
              type="text"
              readOnly
              value={pendingDeleteKey.keyPrefix || pendingDeleteKey.trackingId || pendingDeleteKey.label}
              className="mt-5 h-12 w-full rounded-lg border border-slate-300 bg-white px-4 font-mono text-base text-black outline-none"
            />
            <div className="mt-10 flex justify-end gap-3">
              <Button
                type="button"
                variant="plain"
                size="pill"
                disabled={Boolean(deletingId)}
                onClick={() => setPendingDeleteKey(null)}
                className="h-10 rounded-lg bg-slate-100 px-4 text-base font-medium hover:bg-slate-200"
              >
                {t("apiKeys.cancel")}
              </Button>
              <Button
                type="button"
                variant="danger"
                size="pill"
                disabled={Boolean(deletingId)}
                onClick={() => void deleteKey()}
                className="h-10 rounded-lg px-4 text-base font-bold shadow-none"
              >
                {deletingId ? t("apiKeys.deleting") : t("apiKeys.revokeKey")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {isUsageOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-8"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsUsageOpen(false);
          }}
        >
          <div className="relative max-h-[86vh] w-full max-w-[760px] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setIsUsageOpen(false)}
              className="absolute right-5 top-5 inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-black"
              aria-label={t("apiKeys.close")}
            >
              <FiX className="h-5 w-5" aria-hidden="true" />
            </button>
            <h3 className="text-2xl font-bold text-black">{t("apiKeys.usage")}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">{t("apiKeys.description")}</p>

            <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
              <div className="border-b border-slate-200">
                <button
                  type="button"
                  onClick={() => toggleUsageSection("connection")}
                  className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
                  aria-expanded={openUsageSections.connection}
                >
                  <span className="text-base font-bold text-black">{t("apiKeys.connectionTitle")}</span>
                  <FiChevronDown
                    className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${openUsageSections.connection ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  />
                </button>
                {openUsageSections.connection ? (
                  <div className="grid gap-4 px-4 pb-4 md:grid-cols-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-black">{t("apiKeys.endpointTitle")}</p>
                      <code className="mt-2 block overflow-x-auto rounded-lg bg-slate-950 px-3 py-2 text-xs text-white">
                        POST /api/invoices/upload
                      </code>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-black">{t("apiKeys.authHeader")}</p>
                      <code className="mt-2 block overflow-x-auto rounded-lg bg-slate-950 px-3 py-2 text-xs text-white">
                        X-API-Key: &lt;api_key&gt;
                      </code>
                    </div>
                    <div className="min-w-0 md:col-span-2">
                      <p className="text-sm font-bold text-black">{t("apiKeys.contentTypeTitle")}</p>
                      <code className="mt-2 block overflow-x-auto rounded-lg bg-slate-100 px-3 py-2 text-xs leading-6 text-slate-800">
                        multipart/form-data
                      </code>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="border-b border-slate-200">
                <button
                  type="button"
                  onClick={() => toggleUsageSection("batch")}
                  className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
                  aria-expanded={openUsageSections.batch}
                >
                  <span className="text-base font-bold text-black">{t("apiKeys.batchTitle")}</span>
                  <FiChevronDown
                    className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${openUsageSections.batch ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  />
                </button>
                {openUsageSections.batch ? (
                  <div className="grid gap-4 px-4 pb-4">
                    <p className="text-sm leading-6 text-slate-600">{t("apiKeys.batchSummary")}</p>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-black">{t("apiKeys.batchEndpointTitle")}</p>
                        <code className="mt-2 block overflow-x-auto rounded-lg bg-slate-950 px-3 py-2 text-xs text-white">
                          POST /api/invoices/upload
                        </code>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-black">{t("apiKeys.batchItemsTitle")}</p>
                        <code className="mt-2 block overflow-x-auto rounded-lg bg-slate-100 px-3 py-2 text-xs leading-6 text-slate-800">
                          files PDF / archive.zip + items.json
                        </code>
                      </div>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                      <div className="grid gap-2 border-b border-slate-200 px-4 py-3 md:grid-cols-[120px_120px_minmax(0,1fr)]">
                        <code className="w-fit rounded bg-slate-100 px-2 py-1 text-xs font-bold text-slate-900">files</code>
                        <span className="text-xs font-semibold leading-6 text-emerald-700">{t("apiKeys.fileTypeFile")}</span>
                        <p className="text-sm leading-6 text-slate-600">{t("apiKeys.batchPdfFieldHint")}</p>
                      </div>
                      <div className="grid gap-2 px-4 py-3 md:grid-cols-[120px_120px_minmax(0,1fr)]">
                        <code className="w-fit rounded bg-slate-100 px-2 py-1 text-xs font-bold text-slate-900">items</code>
                        <span className="text-xs font-semibold leading-6 text-emerald-700">{t("apiKeys.fileTypeFile")}</span>
                        <p className="text-sm leading-6 text-slate-600">{t("apiKeys.batchItemsFileHint")}</p>
                      </div>
                    </div>
                    <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                      {t("apiKeys.contentTypeWarning")}
                    </p>
                    <pre className="overflow-x-auto rounded-lg bg-slate-950 px-3 py-3 text-xs leading-6 text-white">
{`curl -X POST https://api.domera.app/api/invoices/upload \\
  -H "X-API-Key: <api_key>" \\
  -F "files=@apt-12.pdf" \\
  -F "files=@apt-15.pdf" \\
  -F "items=@items.json;type=application/json"

curl -X POST https://api.domera.app/api/invoices/upload \\
  -H "X-API-Key: <api_key>" \\
  -F "files=@invoices.zip;type=application/zip"`}
                    </pre>
                    <p className="text-sm font-bold text-black">{t("apiKeys.itemsJsonTitle")}</p>
                    <pre className="overflow-x-auto rounded-lg bg-slate-100 px-3 py-3 text-xs leading-6 text-slate-800">
{`[
  {
    "fileName": "apt-12.pdf",
    "apartmentNumber": "12",
    "period": "2026-05",
    "invoiceDate": "2026-05-27",
    "amount": 125.50,
    "currency": "EUR",
    "externalId": "invoice-2026-05-apt-12",
    "status": "issued"
  },
  {
    "fileName": "apt-15.pdf",
    "contractNumber": "CONTRACT-15",
    "period": "2026-05",
    "invoiceDate": "2026-05-27",
    "amount": 98.20,
    "currency": "EUR",
    "externalId": "invoice-2026-05-apt-15",
    "status": "issued"
  }
]`}
                    </pre>
                    <pre className="overflow-x-auto rounded-lg bg-slate-100 px-3 py-3 text-xs leading-6 text-slate-800">
{`{
  "success": true,
  "batch_id": "batch_f2a54c8730b74e61",
  "total": 2,
  "processed": 2,
  "failed": 0,
  "results": [
    {
      "index": 0,
      "fileName": "apt-12.pdf",
      "success": true,
      "approval_id": "approval_12345"
    }
  ]
}`}
                    </pre>
                  </div>
                ) : null}
              </div>

              <div className="border-b border-slate-200">
                <button
                  type="button"
                  onClick={() => toggleUsageSection("fields")}
                  className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
                  aria-expanded={openUsageSections.fields}
                >
                  <span className="text-base font-bold text-black">{t("apiKeys.requiredFieldsTitle")}</span>
                  <FiChevronDown
                    className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${openUsageSections.fields ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  />
                </button>
                {openUsageSections.fields ? (
                  <div className="px-4 pb-4">
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                      {usageFields.map((field) => (
                        <div
                          key={field.name}
                          className="grid gap-2 border-t border-slate-200 px-4 py-3 first:border-t-0 md:grid-cols-[170px_110px_minmax(0,1fr)] md:items-start"
                        >
                          <code className="w-fit rounded bg-slate-100 px-2 py-1 text-xs font-bold text-slate-900">{field.name}</code>
                          <span className={`text-xs font-semibold leading-6 ${field.optional ? "text-slate-500" : "text-emerald-700"}`}>
                            {field.optional ? t("apiKeys.optionalShort") : t("apiKeys.required")}
                          </span>
                          <p className="min-w-0 text-sm leading-6 text-slate-600">{field.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="border-b border-slate-200">
                <button
                  type="button"
                  onClick={() => toggleUsageSection("rules")}
                  className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
                  aria-expanded={openUsageSections.rules}
                >
                  <span className="text-base font-bold text-black">{t("apiKeys.rulesTitle")}</span>
                  <FiChevronDown
                    className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${openUsageSections.rules ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  />
                </button>
                {openUsageSections.rules ? (
                  <div className="px-4 pb-4">
                    <ul className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                      <li>{t("apiKeys.rulePdf")}</li>
                      <li>{t("apiKeys.ruleDuplicate")}</li>
                      <li>{t("apiKeys.ruleCompany")}</li>
                    </ul>
                  </div>
                ) : null}
              </div>

              <div className="border-b border-slate-200">
                <button
                  type="button"
                  onClick={() => toggleUsageSection("example")}
                  className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
                  aria-expanded={openUsageSections.example}
                >
                  <span className="text-base font-bold text-black">{t("apiKeys.exampleTitle")}</span>
                  <FiChevronDown
                    className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${openUsageSections.example ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  />
                </button>
                {openUsageSections.example ? (
                  <div className="px-4 pb-4">
                    <pre className="overflow-x-auto rounded-lg bg-slate-950 px-3 py-3 text-xs leading-6 text-white">
{`curl -X POST https://api.domera.app/api/invoices/upload \\
  -H "X-API-Key: <api_key>" \\
  -F "file=@invoice.pdf" \\
  -F "apartmentNumber=12" \\
  -F "period=2026-05" \\
  -F "invoiceDate=2026-05-27" \\
  -F "amount=125.50" \\
  -F "currency=EUR" \\
  -F "externalId=invoice-2026-05-apt-12" \\
  -F "status=issued" \\
  -F "comment=optional"`}
                    </pre>
                  </div>
                ) : null}
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => toggleUsageSection("responses")}
                  className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
                  aria-expanded={openUsageSections.responses}
                >
                  <span className="text-base font-bold text-black">{t("apiKeys.responsesTitle")}</span>
                  <FiChevronDown
                    className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${openUsageSections.responses ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  />
                </button>
                {openUsageSections.responses ? (
                  <div className="grid gap-4 px-4 pb-4 md:grid-cols-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-black">{t("apiKeys.successResponseTitle")}</p>
                      <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-100 px-3 py-3 text-xs leading-6 text-slate-800">
{`{
  "success": true,
  "approval_id": "approval_12345",
  "message": "Invoice accepted for approval"
}`}
                      </pre>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-black">{t("apiKeys.errorResponseTitle")}</p>
                      <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-100 px-3 py-3 text-xs leading-6 text-slate-800">
{`{
  "success": false,
  "error": "Apartment not found"
}`}
                      </pre>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-8 flex justify-end">
              <Button
                type="button"
                variant="plain"
                size="pill"
                onClick={() => setIsUsageOpen(false)}
                className="h-10 rounded-lg bg-slate-100 px-4 text-base font-medium hover:bg-slate-200"
              >
                {t("apiKeys.done")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {isSaveOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-8"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsSaveOpen(false);
          }}
        >
          <div className="relative w-full max-w-[560px] rounded-2xl bg-white p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setIsSaveOpen(false)}
              className="absolute right-5 top-5 inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-black"
              aria-label={t("apiKeys.close")}
            >
              <FiX className="h-5 w-5" aria-hidden="true" />
            </button>
              <h3 className="text-2xl font-bold text-black">{t("apiKeys.saveTitle")}</h3>
            <p className="mt-3 text-base leading-7 text-slate-800">
              {t("apiKeys.saveIntroBefore")}{" "}
              <strong>{t("apiKeys.saveIntroStrong")}</strong>{" "}
              {t("apiKeys.saveIntroAfter")}
            </p>
            <p className="mt-5 inline-flex items-center gap-2 border-b border-slate-700 text-base text-slate-800">
              {t("apiKeys.bestPractices")}
              <FiExternalLink className="h-4 w-4" aria-hidden="true" />
            </p>
            <div className="mt-6 grid gap-2 rounded-xl border border-slate-400 p-2 sm:grid-cols-[1fr_auto]">
              <input
                type="text"
                readOnly
                value={generatedKey}
                onFocus={(event) => event.currentTarget.select()}
                className="h-10 min-w-0 rounded-lg bg-white px-2 font-mono text-sm text-black outline-none"
              />
              <Button type="button" variant="dark" size="pill" onClick={copyGeneratedKey} className="h-10 gap-2 rounded-lg px-4 text-sm font-bold">
                <FiCopy className="h-4 w-4" aria-hidden="true" />
                {t("apiKeys.copy")}
              </Button>
            </div>
            <div className="mt-7">
              <p className="text-base font-bold text-black">{t("apiKeys.permissions")}</p>
              <p className="mt-3 text-base text-slate-700">{t("apiKeys.permissionsSummary")}</p>
            </div>
            <div className="mt-10 flex justify-end">
              <Button
                type="button"
                variant="plain"
                size="pill"
                onClick={() => setIsSaveOpen(false)}
                className="h-10 rounded-lg bg-slate-100 px-4 text-base font-medium hover:bg-slate-200"
              >
                {t("apiKeys.done")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
function CompanyPanel({ company, currentUserId }: { company: CompanySettings; currentUserId: string }) {
  const t = useTranslations("settings");
  const notify = useNotifications();
  const [details, setDetails] = useState<CompanyDraft>(() => ({
    companyId: company.companyId,
    name: company.name,
    registrationNumber: company.registrationNumber,
    email: company.email,
    phone: company.phone,
  }));
  const [draft, setDraft] = useState<CompanyDraft>(() => ({
    companyId: company.companyId,
    name: company.name,
    registrationNumber: company.registrationNumber,
    email: company.email,
    phone: company.phone,
  }));
  const [members, setMembers] = useState<CompanyMember[]>(company.members);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberFirstName, setMemberFirstName] = useState("");
  const [memberLastName, setMemberLastName] = useState("");
  const [memberPhone, setMemberPhone] = useState("");
  const [memberPosition, setMemberPosition] = useState("");
  const [memberComment, setMemberComment] = useState("");
  const [memberShowContactToResidents, setMemberShowContactToResidents] = useState(false);
  const [memberCreateAccount, setMemberCreateAccount] = useState(true);
  const [memberRole, setMemberRole] = useState<CompanyMemberRole>("ManagementCompany");
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<EditableCompanyField>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [feedbackTone, setFeedbackTone] = useState<"error" | "success">("error");
  const value = (nextValue: string) => nextValue.trim() || t("emptyValue");

  const companyFieldMeta = {
    name: { label: t("company.fields.name"), type: "text" as const, payloadKey: "companyName" },
    registrationNumber: { label: t("company.fields.registrationNumber"), type: "text" as const, payloadKey: "registrationNumber" },
    email: { label: t("company.fields.email"), type: "email" as const, payloadKey: "companyEmail" },
    phone: { label: t("company.fields.phone"), type: "tel" as const, payloadKey: "companyPhone" },
  };

  const roleLabel = (role: string) => {
    if (role === "Accountant") return t("company.roles.accountant");
    return t("company.roles.managementCompany");
  };

  const accountMembers = members.filter((member) => member.createAccount !== false);
  const residentContacts = members.filter((member) => member.createAccount === false);

  const resetMemberForm = () => {
    setMemberEmail("");
    setMemberFirstName("");
    setMemberLastName("");
    setMemberPhone("");
    setMemberPosition("");
    setMemberComment("");
    setMemberShowContactToResidents(false);
    setMemberCreateAccount(true);
    setMemberRole("ManagementCompany");
    setEditingContactId(null);
  };

  const openMemberModal = () => {
    resetMemberForm();
    setFeedback("");
    setFeedbackTone("error");
    setMemberCreateAccount(true);
    setMemberShowContactToResidents(false);
    setMemberModalOpen(true);
  };

  const openResidentContactModal = () => {
    resetMemberForm();
    setFeedback("");
    setFeedbackTone("error");
    setMemberRole("ManagementCompany");
    setMemberCreateAccount(false);
    setMemberShowContactToResidents(true);
    setMemberModalOpen(true);
  };

  const openEditResidentContactModal = (contact: CompanyMember) => {
    setFeedback("");
    setFeedbackTone("error");
    setEditingContactId(contact.id);
    setMemberEmail(contact.email);
    setMemberFirstName(contact.name);
    setMemberLastName("");
    setMemberPhone(contact.phone ?? "");
    setMemberPosition("");
    setMemberComment(contact.position ?? contact.comment ?? "");
    setMemberRole("ManagementCompany");
    setMemberCreateAccount(false);
    setMemberShowContactToResidents(true);
    setMemberModalOpen(true);
  };

  const closeMemberModal = () => {
    if (isAddingMember) return;
    setFeedback("");
    setFeedbackTone("error");
    setMemberModalOpen(false);
    setEditingContactId(null);
  };

  const startEdit = (field: Exclude<EditableCompanyField, null>) => {
    setDraft(details);
    setFeedback("");
    setFeedbackTone("error");
    setEditingField(field);
  };

  const cancelEdit = () => {
    setDraft(details);
    setFeedback("");
    setFeedbackTone("error");
    setEditingField(null);
  };

  const saveCompanyField = async () => {
    if (!editingField) return;

    const nextValue = draft[editingField].trim();
    if (editingField === "name" && !nextValue) {
      setFeedbackTone("error");
      setFeedback(t("errors.companyNameRequired"));
      notify.error(t("errors.companyNameRequired"));
      return;
    }

    setIsSaving(true);
    setFeedback("");

    try {
      await updateCompany(details.companyId, {
        [companyFieldMeta[editingField].payloadKey]: nextValue,
      });

      setDetails((current) => ({ ...current, [editingField]: nextValue }));
      setDraft((current) => ({ ...current, [editingField]: nextValue }));
      setEditingField(null);
      notify.success(t("toast.companySaved"));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("errors.companySaveFailed");
      setFeedbackTone("error");
      setFeedback(message);
      notify.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const addMember = async () => {
    const email = memberEmail.trim().toLowerCase();
    const firstName = memberFirstName.trim();
    const lastName = memberLastName.trim();
    const phone = memberPhone.trim();
    const position = memberCreateAccount ? memberPosition.trim() : memberComment.trim();
    const comment = "";
    if (memberCreateAccount && (!email || !firstName || !lastName)) {
      const message = t("errors.memberFieldsRequired");
      setFeedbackTone("error");
      setFeedback(message);
      notify.error(message);
      return;
    }
    if (!memberCreateAccount && (!firstName || (!email && !phone))) {
      const message = t("errors.contactFieldsRequired");
      setFeedbackTone("error");
      setFeedback(message);
      notify.error(message);
      return;
    }

    setIsAddingMember(true);
    setFeedback("");

    try {
      const result = await addCompanyMember(details.companyId, {
        memberId: editingContactId ?? undefined,
        email,
        firstName,
        lastName,
        phone: phone || undefined,
        position: position || undefined,
        comment: comment || undefined,
        showContactToResidents: memberShowContactToResidents,
        createAccount: memberCreateAccount,
        role: memberRole,
      });
      const nextMember = result.member ?? {};
      const id = typeof nextMember.id === "string" ? nextMember.id : email || `${firstName}-${lastName}-${Date.now()}`;
      const savedRole = typeof nextMember.role === "string" ? nextMember.role : memberRole;
      const savedPhone = typeof nextMember.phone === "string" ? nextMember.phone : phone;
      const savedPosition = typeof nextMember.position === "string" ? nextMember.position : position;
      const savedComment = typeof nextMember.comment === "string" ? nextMember.comment : "";
      const savedShowContactToResidents = typeof nextMember.showContactToResidents === "boolean"
        ? nextMember.showContactToResidents
        : memberShowContactToResidents;
      const savedCreateAccount = typeof nextMember.createAccount === "boolean"
        ? nextMember.createAccount
        : memberCreateAccount;
      const fullName = [firstName, lastName].filter(Boolean).join(" ");

      setMembers((current) => {
        const filtered = current.filter((item) => item.id !== id && item.id !== editingContactId && (!email || item.email.toLowerCase() !== email));
        return [
          ...filtered,
          {
            id,
            email,
            name: fullName,
            phone: savedPhone,
            position: savedPosition,
            comment: savedComment,
            showContactToResidents: savedShowContactToResidents,
            createAccount: savedCreateAccount,
            role: savedRole,
          },
        ];
      });
      resetMemberForm();
      setMemberModalOpen(false);
      notify.success(result.mode === "invitation" ? t("toast.memberInvitationSent") : t("toast.memberAdded"));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("errors.memberAddFailed");
      setFeedbackTone("error");
      setFeedback(message);
      notify.error(message);
    } finally {
      setIsAddingMember(false);
    }
  };

  const removeMember = async (member: CompanyMember) => {
    const memberId = member.id.trim();
    if (!memberId || memberId === currentUserId || memberId === details.companyId) return;
    if (!window.confirm(t("company.members.removeConfirm", { name: member.name || member.email }))) return;

    setRemovingMemberId(memberId);
    setFeedback("");

    try {
      await removeCompanyMember(details.companyId, memberId);
      setMembers((current) => current.filter((item) => item.id !== memberId));
      notify.success(t("toast.memberRemoved"));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("errors.memberRemoveFailed");
      setFeedbackTone("error");
      setFeedback(message);
      notify.error(message);
    } finally {
      setRemovingMemberId(null);
    }
  };

  const renderCompanyField = (field: Exclude<EditableCompanyField, null>) => {
    const meta = companyFieldMeta[field];

    if (editingField === field) {
      return (
        <TextEditRow
          id={`settings-company-${field}`}
          label={meta.label}
          type={meta.type}
          value={draft[field]}
          disabled={isSaving}
          feedback={feedback}
          feedbackTone={feedbackTone}
          onChange={(nextValue) => setDraft((current) => ({ ...current, [field]: nextValue }))}
          onCancel={cancelEdit}
          onSave={saveCompanyField}
        />
      );
    }

    return <SettingsRow label={meta.label} value={value(details[field])} onEdit={() => startEdit(field)} />;
  };

  return (
    <div className="py-7">
      <h2 className="text-xl font-bold leading-7 text-black">{t("company.title")}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{t("company.description")}</p>

      <div className="mt-7">
        {renderCompanyField("name")}
        {renderCompanyField("registrationNumber")}
        {renderCompanyField("email")}
        {renderCompanyField("phone")}
      </div>

      <div className="mt-8 border-t border-slate-200 pt-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-black">{t("company.members.title")}</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{t("company.members.description")}</p>
          </div>
          <Button type="button" variant="dark" size="pill" onClick={openMemberModal} className="h-11 px-6 font-bold">
            {t("company.members.add")}
          </Button>
        </div>

        <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
          {accountMembers.length > 0 ? (
            accountMembers.map((member) => {
              const canRemove = member.id !== currentUserId && member.id !== details.companyId;
              const isRemoving = removingMemberId === member.id;

              return (
              <div key={member.id || member.email} className="grid gap-3 border-t border-slate-200 px-4 py-3 first:border-t-0 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-black">{member.name || member.email}</p>
                  <p className="truncate text-sm text-slate-600">{member.email || t("emptyValue")}</p>
                  {member.phone || member.position ? (
                    <p className="truncate text-xs text-slate-500">
                      {[member.position, member.phone].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  {member.showContactToResidents ? (
                    <span className="w-fit rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      {t("company.members.publicContact")}
                    </span>
                  ) : null}
                  <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {roleLabel(member.role)}
                  </span>
                  {canRemove ? (
                    <Button
                      type="button"
                      variant="inlineLink"
                      size="link"
                      disabled={isRemoving}
                      onClick={() => void removeMember(member)}
                      className="text-xs font-semibold text-red-600 hover:text-red-700"
                    >
                      {isRemoving ? t("company.members.removing") : t("company.members.remove")}
                    </Button>
                  ) : null}
                </div>
              </div>
              );
            })
          ) : (
            <p className="px-4 py-5 text-sm text-slate-600">{t("company.members.empty")}</p>
          )}
        </div>
      </div>

      <div className="mt-8 border-t border-slate-200 pt-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-black">{t("company.residentContacts.title")}</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{t("company.residentContacts.description")}</p>
          </div>
          <Button type="button" variant="dark" size="pill" onClick={openResidentContactModal} className="h-11 px-6 font-bold">
            {t("company.residentContacts.add")}
          </Button>
        </div>

        <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
          {residentContacts.length > 0 ? (
            residentContacts.map((contact) => {
              const isRemoving = removingMemberId === contact.id;

              return (
                <div key={contact.id || contact.email} className="grid gap-3 border-t border-slate-200 px-4 py-3 first:border-t-0 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-black">{contact.name || contact.email || contact.phone}</p>
                    <p className="truncate text-sm text-slate-600">
                      {[contact.email, contact.phone].filter(Boolean).join(" · ") || t("emptyValue")}
                    </p>
                    {contact.position ? <p className="truncate text-xs text-slate-500">{contact.position}</p> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <span className="w-fit rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      {t("company.members.publicContact")}
                    </span>
                    <Button
                      type="button"
                      variant="inlineLink"
                      size="link"
                      disabled={isRemoving}
                      onClick={() => openEditResidentContactModal(contact)}
                      className="text-xs font-semibold"
                    >
                      {t("actions.edit")}
                    </Button>
                    <Button
                      type="button"
                      variant="inlineLink"
                      size="link"
                      disabled={isRemoving}
                      onClick={() => void removeMember(contact)}
                      className="text-xs font-semibold text-red-600 hover:text-red-700"
                    >
                      {isRemoving ? t("company.members.removing") : t("company.members.remove")}
                    </Button>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="px-4 py-5 text-sm text-slate-600">{t("company.residentContacts.empty")}</p>
          )}
        </div>
      </div>

      <Modal
        open={memberModalOpen}
        onClose={closeMemberModal}
        title={
          memberCreateAccount
            ? t("company.members.add")
            : editingContactId
              ? t("company.residentContacts.edit")
              : t("company.residentContacts.add")
        }
        size="lg"
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void addMember();
          }}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block min-w-0">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                {memberCreateAccount ? t("fields.firstName") : t("company.residentContacts.nameLabel")}
              </span>
              <input
                type="text"
                value={memberFirstName}
                disabled={isAddingMember}
                onChange={(event) => setMemberFirstName(event.target.value)}
                placeholder={memberCreateAccount ? t("company.members.firstNamePlaceholder") : t("company.residentContacts.namePlaceholder")}
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-black outline-none transition placeholder:text-slate-400 focus:border-black focus:ring-2 focus:ring-black/10"
              />
            </label>
            {memberCreateAccount ? (
              <label className="block min-w-0">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t("fields.lastName")}
                </span>
                <input
                  type="text"
                  value={memberLastName}
                  disabled={isAddingMember}
                  onChange={(event) => setMemberLastName(event.target.value)}
                  placeholder={t("company.members.lastNamePlaceholder")}
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-black outline-none transition placeholder:text-slate-400 focus:border-black focus:ring-2 focus:ring-black/10"
                />
              </label>
            ) : null}
            <label className="block min-w-0">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t("fields.email")}
              </span>
              <input
                type="email"
                value={memberEmail}
                disabled={isAddingMember}
                onChange={(event) => setMemberEmail(event.target.value)}
                placeholder={t("company.members.emailPlaceholder")}
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-black outline-none transition placeholder:text-slate-400 focus:border-black focus:ring-2 focus:ring-black/10"
              />
            </label>
            <label className="block min-w-0">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t("fields.phone")}
              </span>
              <input
                type="tel"
                value={memberPhone}
                disabled={isAddingMember}
                onChange={(event) => setMemberPhone(event.target.value)}
                placeholder={t("company.members.phonePlaceholder")}
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-black outline-none transition placeholder:text-slate-400 focus:border-black focus:ring-2 focus:ring-black/10"
              />
            </label>
            {memberCreateAccount ? (
              <label className="block min-w-0">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t("company.members.positionLabel")}
                </span>
                <input
                  type="text"
                  value={memberPosition}
                  disabled={isAddingMember}
                  onChange={(event) => setMemberPosition(event.target.value)}
                  placeholder={t("company.members.positionPlaceholder")}
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-black outline-none transition placeholder:text-slate-400 focus:border-black focus:ring-2 focus:ring-black/10"
                />
              </label>
            ) : (
              <label className="block min-w-0 md:col-span-2">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t("company.residentContacts.commentLabel")}
                </span>
                <textarea
                  value={memberComment}
                  disabled={isAddingMember}
                  onChange={(event) => setMemberComment(event.target.value)}
                  placeholder={t("company.residentContacts.commentPlaceholder")}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm text-black outline-none transition placeholder:text-slate-400 focus:border-black focus:ring-2 focus:ring-black/10"
                />
              </label>
            )}
            {memberCreateAccount ? (
              <label className="block min-w-0">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t("company.members.roleLabel")}
                </span>
                <select
                  value={memberRole}
                  disabled={isAddingMember}
                  onChange={(event) => setMemberRole(event.target.value as CompanyMemberRole)}
                  className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-black outline-none transition focus:border-black focus:ring-2 focus:ring-black/10"
                >
                  <option value="ManagementCompany">{t("company.roles.managementCompany")}</option>
                  <option value="Accountant">{t("company.roles.accountant")}</option>
                </select>
              </label>
            ) : null}
          </div>
          {memberCreateAccount ? (
            <label className="flex min-w-0 items-start gap-3 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={memberShowContactToResidents}
                disabled={isAddingMember}
                onChange={(event) => setMemberShowContactToResidents(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-black focus:ring-black"
              />
              <span>{t("company.members.showContactToResidents")}</span>
            </label>
          ) : null}
          {feedback && feedbackTone === "error" ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{feedback}</p>
          ) : null}
          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" disabled={isAddingMember} onClick={closeMemberModal}>
              {t("actions.cancel")}
            </Button>
            <Button type="submit" variant="dark" disabled={isAddingMember} className="font-bold">
              {isAddingMember
                ? t("company.members.adding")
                : memberCreateAccount
                  ? t("company.members.add")
                  : editingContactId
                    ? t("company.residentContacts.save")
                    : t("company.residentContacts.add")}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function SettingsTabs({ user, notificationSettings, company }: SettingsTabsProps) {
  const notify = useNotifications();
  const t = useTranslations("settings");
  const tabs = company?.canManage ? (["user", "company", "apiKey", "notifications"] satisfies SettingsTab[]) : baseTabs;
  const [activeTab, setActiveTab] = useState<SettingsTab>("user");
  const [editingField, setEditingField] = useState<EditableField>(null);
  const [displayName, setDisplayName] = useState(user.username);
  const [headerName, setHeaderName] = useState(user.userName);
  const [draftName, setDraftName] = useState<NameDraft>(() => splitDisplayName(user.username));
  const [email, setEmail] = useState(user.email);
  const [draftEmail, setDraftEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone);
  const [draftPhone, setDraftPhone] = useState(user.phone);
  const [draftPassword, setDraftPassword] = useState<PasswordDraft>({ current: "", next: "", repeat: "" });
  const [visiblePasswordFields, setVisiblePasswordFields] = useState<Record<VisiblePasswordField, boolean>>({
    current: false,
    next: false,
    repeat: false,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackTone, setFeedbackTone] = useState<"error" | "success">("error");

  const showSuccess = (message: string) => {
    setFeedbackTone("success");
    setFeedback(message);
    notify.success(message);
  };

  const fieldValue = (value: string) => value.trim() || t("emptyValue");

  const showError = (message: string) => {
    setFeedbackTone("error");
    setFeedback(message);
    notify.error(message);
  };

  const startEmailEdit = () => {
    setDraftEmail(email);
    setFeedback("");
    setFeedbackTone("error");
    setEditingField("email");
  };

  const cancelEdit = () => {
    setDraftEmail(email);
    setFeedback("");
    setFeedbackTone("error");
    setEditingField(null);
  };

  const saveEmail = async () => {
    const nextEmail = draftEmail.trim();
    if (!nextEmail) {
      showError(t("errors.emailRequired"));
      return;
    }

    setIsSaving(true);
    setFeedback("");

    try {
      const result = await changeAccountEmail(nextEmail);
      if (result.verificationRequired) {
        showSuccess(t("toast.emailVerificationSent", { email: result.pendingEmail ?? nextEmail }));
      } else {
        const savedEmail = result.email ?? nextEmail.toLowerCase();
        setEmail(savedEmail);
        setDraftEmail(savedEmail);
        setEditingField(null);
        notify.success(t("toast.emailSaved"));
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : t("errors.emailSaveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  const startNameEdit = () => {
    setDraftName(splitDisplayName(displayName));
    setFeedback("");
    setFeedbackTone("error");
    setEditingField("name");
  };

  const cancelNameEdit = () => {
    setDraftName(splitDisplayName(displayName));
    setFeedback("");
    setFeedbackTone("error");
    setEditingField(null);
  };

  const updateNameDraft = (field: keyof NameDraft, value: string) => {
    setDraftName((current) => ({ ...current, [field]: value }));
  };

  const saveName = async () => {
    const firstName = draftName.firstName.trim();
    const lastName = draftName.lastName.trim();
    const fullName = [firstName, lastName].filter(Boolean).join(" ");

    if (!firstName || !lastName) {
      showError(t("errors.nameRequired"));
      return;
    }

    setIsSaving(true);
    setFeedback("");

    try {
      await saveUserProfile(user.userId, {
        firstName,
        lastName,
        fullName,
        name: fullName,
        displayName: fullName,
      });

      setDisplayName(fullName);
      setHeaderName(fullName.toUpperCase());
      setDraftName({ firstName, lastName });
      setEditingField(null);
      notify.success(t("toast.nameSaved"));
    } catch (error) {
      showError(error instanceof Error ? error.message : t("errors.nameSaveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  const startPhoneEdit = () => {
    setDraftPhone(phone);
    setFeedback("");
    setFeedbackTone("error");
    setEditingField("phone");
  };

  const cancelPhoneEdit = () => {
    setDraftPhone(phone);
    setFeedback("");
    setFeedbackTone("error");
    setEditingField(null);
  };

  const savePhone = async () => {
    const nextPhone = draftPhone.trim();

    if (!nextPhone) {
      showError(t("errors.phoneRequired"));
      return;
    }

    setIsSaving(true);
    setFeedback("");

    try {
      await saveUserProfile(user.userId, {
        phone: nextPhone,
        phoneNumber: nextPhone,
      });

      setPhone(nextPhone);
      setDraftPhone(nextPhone);
      setEditingField(null);
      notify.success(t("toast.phoneSaved"));
    } catch (error) {
      showError(error instanceof Error ? error.message : t("errors.phoneSaveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  const resetPasswordDraft = () => {
    setDraftPassword({ current: "", next: "", repeat: "" });
    setVisiblePasswordFields({ current: false, next: false, repeat: false });
  };

  const startPasswordEdit = () => {
    resetPasswordDraft();
    setFeedback("");
    setFeedbackTone("error");
    setEditingField("password");
  };

  const cancelPasswordEdit = () => {
    resetPasswordDraft();
    setFeedback("");
    setFeedbackTone("error");
    setEditingField(null);
  };

  const savePassword = async () => {
    if (!draftPassword.current || !draftPassword.next || !draftPassword.repeat) {
      showError(t("errors.passwordFieldsRequired"));
      return;
    }

    if (draftPassword.next !== draftPassword.repeat) {
      showError(t("errors.passwordsDoNotMatch"));
      return;
    }

    if (!isStrongPassword(draftPassword.next)) {
      showError(t("errors.passwordWeak"));
      return;
    }

    setIsSaving(true);
    setFeedback("");

    try {
      await changeAccountPassword(draftPassword.current, draftPassword.next);
      resetPasswordDraft();
      setEditingField(null);
      notify.success(t("toast.passwordSaved"));
    } catch (error) {
      showError(error instanceof Error ? error.message : t("errors.passwordSaveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  const updatePasswordDraft = (field: keyof PasswordDraft, value: string) => {
    setDraftPassword((current) => ({ ...current, [field]: value }));
  };

  const togglePasswordVisibility = (field: VisiblePasswordField) => {
    setVisiblePasswordFields((current) => ({ ...current, [field]: !current[field] }));
  };

  return (
    <section className="w-full bg-white px-6 py-6 sm:px-8 lg:px-10">
      <div className="overflow-x-auto border-b border-slate-300">
        <nav className="flex min-w-max gap-7" aria-label={t("sectionsAria")}>
          {tabs.map((tab) => {
            const isActive = tab === activeTab;

            return (
              <div key={tab} className="relative pb-5">
                <Button
                  type="button"
                  variant="plain"
                  size="link"
                  onClick={() => setActiveTab(tab)}
                  className="text-base font-semibold text-black"
                  aria-current={isActive ? "page" : undefined}
                >
                  {t(`tabs.${tab}`)}
                </Button>
                {isActive ? <span className="absolute inset-x-0 bottom-0 h-[3px] bg-black" aria-hidden="true" /> : null}
              </div>
            );
          })}
        </nav>
      </div>

      {activeTab === "user" ? (
        <>
          <div className="flex items-center gap-4 border-b border-slate-200 py-8">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black text-white">
              <FaRegUser className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold leading-7 text-black">{headerName}</p>
            </div>
          </div>

          <div className="pt-5">
            <h2 className="mb-3 text-lg font-bold text-black">{t("personalData")}</h2>
            {editingField === "email" ? (
              <EmailEditRow
                value={draftEmail}
                disabled={isSaving}
                feedback={feedback}
                feedbackTone={feedbackTone}
                onChange={setDraftEmail}
                onCancel={cancelEdit}
                onSave={saveEmail}
              />
            ) : (
              <SettingsRow label={t("fields.email")} value={email} withInfo onEdit={startEmailEdit} />
            )}
            {editingField === "name" ? (
              <NameEditRow
                value={draftName}
                disabled={isSaving}
                feedback={feedback}
                feedbackTone={feedbackTone}
                onChange={updateNameDraft}
                onCancel={cancelNameEdit}
                onSave={saveName}
              />
            ) : (
              <SettingsRow label={t("fields.username")} value={displayName} onEdit={startNameEdit} />
            )}
            {editingField === "phone" ? (
              <PhoneEditRow
                value={draftPhone}
                disabled={isSaving}
                feedback={feedback}
                feedbackTone={feedbackTone}
                label={t("fields.phone")}
                placeholder={t("placeholders.phone")}
                saveLabel={t("actions.save")}
                cancelLabel={t("actions.cancel")}
                onChange={setDraftPhone}
                onCancel={cancelPhoneEdit}
                onSave={savePhone}
              />
            ) : (
              <SettingsRow label={t("fields.phone")} value={fieldValue(phone)} onEdit={startPhoneEdit} />
            )}
            {editingField === "password" ? (
              <PasswordEditRow
                value={draftPassword}
                visibleFields={visiblePasswordFields}
                disabled={isSaving}
                feedback={feedback}
                feedbackTone={feedbackTone}
                onChange={updatePasswordDraft}
                onCancel={cancelPasswordEdit}
                onSave={savePassword}
                onToggleVisible={togglePasswordVisibility}
              />
            ) : (
              <SettingsRow label={t("fields.password")} value="******" onEdit={startPasswordEdit} />
            )}
          </div>
        </>
      ) : null}

      {activeTab === "notifications" ? <NotificationsPanel initialSettings={notificationSettings} /> : null}

      {activeTab === "company" && company?.canManage ? <CompanyPanel company={company} currentUserId={user.userId} /> : null}

      {activeTab === "apiKey" && company?.canManage ? (
        <ApiKeyPanel
          companyId={company.companyId}
          createdByName={displayName}
          buildings={company.buildings}
          initialKeys={company.apiKeys}
        />
      ) : null}

    </section>
  );
}
