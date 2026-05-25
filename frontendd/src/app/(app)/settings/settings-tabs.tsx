"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { FaEye, FaInfoCircle, FaRegUser } from "react-icons/fa";
import { Button } from "@/components/ui/button";
import { changeAccountEmail, changeAccountPassword, saveUserProfile } from "@/shared/api/auth";
import { addCompanyMember, removeCompanyMember, updateCompany } from "@/shared/api/company";
import { type NotificationSettings, updateNotificationSettings } from "@/shared/api/notifications";
import { useNotifications } from "@/shared/hooks/use-notifications";
import { isStrongPassword } from "@/shared/lib/password-validation";

type SettingsTab = "user" | "company" | "notifications" | "contacts" | "billing" | "additionalUsers" | "dataManagement";

type UserSettings = {
  userId: string;
  userName: string;
  clientNumber: string;
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
  members: CompanyMember[];
};

type CompanyMember = {
  id: string;
  email: string;
  name: string;
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
  const [memberRole, setMemberRole] = useState<CompanyMemberRole>("ManagementCompany");
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
    if (!email || !firstName || !lastName) {
      const message = t("errors.memberFieldsRequired");
      setFeedbackTone("error");
      setFeedback(message);
      notify.error(message);
      return;
    }

    setIsAddingMember(true);
    setFeedback("");

    try {
      const result = await addCompanyMember(details.companyId, {
        email,
        firstName,
        lastName,
        role: memberRole,
      });
      const nextMember = result.member ?? {};
      const id = typeof nextMember.id === "string" ? nextMember.id : email;
      const savedRole = typeof nextMember.role === "string" ? nextMember.role : memberRole;
      const fullName = [firstName, lastName].join(" ");

      setMembers((current) => {
        const filtered = current.filter((item) => item.id !== id && item.email.toLowerCase() !== email);
        return [
          ...filtered,
          {
            id,
            email,
            name: fullName,
            role: savedRole,
          },
        ];
      });
      setMemberEmail("");
      setMemberFirstName("");
      setMemberLastName("");
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
        <h3 className="text-lg font-bold text-black">{t("company.members.title")}</h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{t("company.members.description")}</p>

        <form
          className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void addMember();
          }}
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="block min-w-0">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t("fields.firstName")}
              </span>
              <input
                type="text"
                value={memberFirstName}
                disabled={isAddingMember}
                onChange={(event) => setMemberFirstName(event.target.value)}
                placeholder={t("company.members.firstNamePlaceholder")}
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-black outline-none transition placeholder:text-slate-400 focus:border-black focus:ring-2 focus:ring-black/10"
              />
            </label>
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
          </div>
          <div className="mt-4 flex justify-end">
            <Button type="submit" variant="dark" size="pill" disabled={isAddingMember} className="h-11 px-6 font-bold">
              {isAddingMember ? t("company.members.adding") : t("company.members.add")}
            </Button>
          </div>
        </form>

        <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
          {members.length > 0 ? (
            members.map((member) => {
              const canRemove = member.id !== currentUserId && member.id !== details.companyId;
              const isRemoving = removingMemberId === member.id;

              return (
              <div key={member.id || member.email} className="grid gap-3 border-t border-slate-200 px-4 py-3 first:border-t-0 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-black">{member.name || member.email}</p>
                  <p className="truncate text-sm text-slate-600">{member.email || t("emptyValue")}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
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
    </div>
  );
}

export function SettingsTabs({ user, notificationSettings, company }: SettingsTabsProps) {
  const notify = useNotifications();
  const t = useTranslations("settings");
  const tabs = company?.canManage ? (["user", "company", "notifications"] satisfies SettingsTab[]) : baseTabs;
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
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white px-6 py-6 shadow-sm sm:px-8">
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
              <p className="mt-1 text-sm leading-5 text-slate-600">
                {t("clientNumber")} {user.clientNumber}
              </p>
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

    </section>
  );
}
