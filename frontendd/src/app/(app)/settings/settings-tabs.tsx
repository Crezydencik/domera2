"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { FaEye, FaInfoCircle, FaRegUser } from "react-icons/fa";
import { Button } from "@/components/ui/button";
import { changeAccountEmail, changeAccountPassword, saveUserProfile } from "@/shared/api/auth";
import { useNotifications } from "@/shared/hooks/use-notifications";
import { isStrongPassword } from "@/shared/lib/password-validation";

type SettingsTab = "user" | "notifications" | "contacts" | "billing" | "additionalUsers" | "dataManagement";

type UserSettings = {
  userId: string;
  userName: string;
  clientNumber: string;
  email: string;
  username: string;
  phone: string;
  personalCode: string;
};

type SettingsTabsProps = {
  user: UserSettings;
};

type EditableField = "email" | "name" | "phone" | "password" | null;

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

const tabs: SettingsTab[] = ["user", "notifications"];

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
      <Button
        type="button"
        variant="inlineLink"
        size="link"
        onClick={onEdit}
        className="justify-self-start font-semibold leading-5 sm:justify-self-end"
      >
        {t("actions.edit")}
      </Button>
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

function NotificationToggle({ label }: { label: string }) {
  return (
    <label className="block w-fit cursor-pointer">
      <span className="block text-base leading-6 text-black">{label}</span>
      <span className="mt-1.5 block">
        <input type="checkbox" defaultChecked className="peer sr-only" aria-label={label} />
        <span className="flex h-6 w-[50px] items-center rounded-full bg-slate-300 p-0.5 transition peer-checked:bg-blue-500">
          <span className="h-5 w-5 rounded-full bg-white shadow-sm transition peer-checked:translate-x-6" />
        </span>
      </span>
    </label>
  );
}

function NotificationsPanel() {
  const t = useTranslations("settings");

  return (
    <div className="py-7">
      <h2 className="text-xl font-bold leading-7 text-black">{t("notifications.title")}</h2>

      <div className="mt-7 space-y-5">
        <NotificationToggle label={t("notifications.general")} />
        <NotificationToggle label={t("notifications.meterReminder")} />
        <NotificationToggle label={t("notifications.paymentReminder")} />

        <label className="block">
          <span className="block text-base leading-6 text-black">{t("notifications.language")}</span>
          <select className="mt-1 h-[34px] w-44 rounded border border-black bg-white px-2 text-base leading-6 text-black">
            <option>{t("languages.ru")}</option>
            <option>{t("languages.lv")}</option>
            <option>{t("languages.en")}</option>
          </select>
        </label>
      </div>
    </div>
  );
}

export function SettingsTabs({ user }: SettingsTabsProps) {
  const notify = useNotifications();
  const t = useTranslations("settings");
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
              <Button
                key={tab}
                type="button"
                variant="plain"
                size="link"
                onClick={() => setActiveTab(tab)}
                className={`pb-5 text-base font-semibold text-black ${
                  isActive ? "border-b-[3px] border-black" : "border-b-[3px] border-transparent"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                {t(`tabs.${tab}`)}
              </Button>
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

      {activeTab === "notifications" ? <NotificationsPanel /> : null}


    </section>
  );
}
