import { cookies } from "next/headers";
import type { NotificationSettings } from "@/shared/api/notifications";
import { apiFetch, getRoleDataBundle } from "@/shared/lib/domera-api.server";
import { SettingsTabs } from "./settings-tabs";

type SettingsPageProps = {
  searchParams?: Promise<{ role?: string }>;
};

type UnknownRecord = Record<string, unknown>;

const defaultNotificationSettings: NotificationSettings = {
  general: true,
  meterReminder: true,
  paymentReminder: true,
  language: "ru",
};

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function joinNameParts(profile: UnknownRecord | undefined): string {
  return firstString(
    profile?.fullName,
    [profile?.firstName, profile?.lastName].filter((value) => typeof value === "string" && value.trim()).join(" "),
    profile?.name,
    profile?.displayName,
  );
}

function maskPersonalCode(value: string): string {
  if (!value) return "190299-*****";
  const normalized = value.replace(/\s/g, "");
  if (normalized.length <= 6) return `${normalized}*****`;

  return `${normalized.slice(0, 6)}-*****`;
}

function normalizeAccessValue(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/[^a-z]/gi, "")
    .toLowerCase();
}

function normalizeNotificationSettings(value: unknown): NotificationSettings {
  const settings = value && typeof value === "object" ? value as UnknownRecord : {};
  const language = settings.language === "lv" || settings.language === "en" || settings.language === "ru"
    ? settings.language
    : defaultNotificationSettings.language;

  return {
    general: typeof settings.general === "boolean" ? settings.general : defaultNotificationSettings.general,
    meterReminder: typeof settings.meterReminder === "boolean" ? settings.meterReminder : defaultNotificationSettings.meterReminder,
    paymentReminder: typeof settings.paymentReminder === "boolean" ? settings.paymentReminder : defaultNotificationSettings.paymentReminder,
    language,
  };
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const params = (await searchParams) ?? {};
  const data = await getRoleDataBundle(params.role);
  const cookieStore = await cookies();
  const profile = data.profile;

  const userId = firstString(profile?.uid, profile?.id, data.userId, cookieStore.get("userId")?.value);
  const email = firstString(profile?.email, cookieStore.get("userEmail")?.value, "kargini@inbox.lv");
  const fullName = firstString(joinNameParts(profile), email.split("@")[0], "DENISS KARGINS");
  const userName = fullName.toUpperCase();
  const clientNumber = firstString(profile?.clientNumber, profile?.customerNumber, userId, "13475715");
  const username = fullName;
  const phone = firstString(profile?.phone, profile?.phoneNumber, profile?.mobile, profile?.telephone, "");
  const personalCode = maskPersonalCode(firstString(profile?.personalCode, profile?.identityCode));
  const notificationSettings = normalizeNotificationSettings(profile?.notificate ?? profile?.notificationSettings);
  const companyId = firstString(data.companyId, profile?.companyId, userId);
  const accountType = firstString(profile?.accountType, profile?.role);
  const canManageCompany = data.role === "managementCompany" && normalizeAccessValue(accountType) === "managementcompany";
  const company = canManageCompany && companyId
    ? await apiFetch<UnknownRecord>(`/company/${encodeURIComponent(companyId)}`).catch(() => null)
    : null;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <SettingsTabs
        user={{
          userName,
          userId,
          clientNumber,
          email,
          username,
          phone,
          personalCode,
        }}
        notificationSettings={notificationSettings}
        company={{
          canManage: canManageCompany,
          companyId,
          name: firstString(company?.companyName, company?.name, profile?.companyName, fullName),
          registrationNumber: firstString(company?.registrationNumber, profile?.registrationNumber),
          email: firstString(company?.companyEmail, company?.email, company?.contactEmail, profile?.companyEmail, email),
          phone: firstString(company?.companyPhone, company?.phone, company?.contactPhone, profile?.companyPhone),
          members: data.residents
            .filter((item) => item.role === "ManagementCompany" || item.role === "Accountant")
            .map((item) => ({
              id: item.id,
              email: item.email ?? "",
              name: item.fullName,
              role: item.role,
            })),
        }}
      />
    </div>
  );
}
