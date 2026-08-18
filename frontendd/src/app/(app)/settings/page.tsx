import type { CompanyApiKeyItem, CompanyMemberPermissions } from "@/shared/api/company";
import type { NotificationSettings } from "@/shared/api/notifications";
import { isApprovedBuilding, isElectricityEnabledBuilding } from "@/shared/lib/buildings";
import { apiFetch } from "@/shared/server/api-client";
import { getSettingsPageData } from "@/shared/server/page-loaders/settings.loader";
import { SettingsTabs } from "./settings-tabs";

type SettingsPageProps = {
  searchParams?: Promise<{ role?: string }>;
};

type UnknownRecord = Record<string, unknown>;
type InvoiceSettingsLanguage = "ru" | "lv" | "en";
type InvoiceNumberPart = "companyCode" | "apartmentNumber" | "month" | "year" | "date" | "sequence";
type InvoiceLineItem = "electricityAdvance" | "electricityPayment" | "other";
type InvoiceTableColumn = "period" | "price" | "amount" | "unit" | "vat" | "sum" | "recalculation" | "net";
type CompanyMemberType = "manager" | "employee" | "contact";

const invoiceNumberPartOptions: InvoiceNumberPart[] = ["companyCode", "apartmentNumber", "month", "year", "date", "sequence"];
const invoiceLineItemOptions: InvoiceLineItem[] = ["electricityAdvance", "electricityPayment", "other"];
const invoiceTableColumnOptions: InvoiceTableColumn[] = ["period", "price", "amount", "unit", "vat", "sum", "recalculation", "net"];
const defaultInvoiceLineItems: InvoiceLineItem[] = ["electricityAdvance", "electricityPayment", "other"];
const defaultInvoiceTableColumns: InvoiceTableColumn[] = ["period", "price", "amount", "unit", "sum", "recalculation"];

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

function normalizeInvoiceAccentColor(value: unknown): string {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value.trim()) ? value.trim() : "";
}

function normalizeInvoiceLogoDataUrl(value: unknown): string {
  return typeof value === "string" && /^data:image\/(?:png|jpe?g|webp);base64,/i.test(value) ? value : "";
}

function normalizeInvoiceNumberParts(value: unknown): InvoiceNumberPart[] {
  return Array.isArray(value)
    ? value.filter((item): item is InvoiceNumberPart =>
      typeof item === "string" && invoiceNumberPartOptions.includes(item as InvoiceNumberPart),
    )
    : [];
}

function normalizeInvoiceNumberSeparators(value: unknown): Partial<Record<InvoiceNumberPart, string>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    invoiceNumberPartOptions
      .map((part) => [part, (value as UnknownRecord)[part]])
      .filter((entry): entry is [InvoiceNumberPart, string] => typeof entry[1] === "string"),
  );
}

function normalizeInvoiceLineItems(value: unknown): InvoiceLineItem[] {
  const items = Array.isArray(value)
    ? value.filter((item): item is InvoiceLineItem =>
      typeof item === "string" && invoiceLineItemOptions.includes(item as InvoiceLineItem),
    )
    : [];

  return items.length > 0 ? items : defaultInvoiceLineItems;
}

function normalizeInvoiceTableColumns(value: unknown): InvoiceTableColumn[] {
  const columns = Array.isArray(value)
    ? value.filter((item): item is InvoiceTableColumn =>
      typeof item === "string" && invoiceTableColumnOptions.includes(item as InvoiceTableColumn),
    )
    : [];

  return columns.length > 0 ? columns : defaultInvoiceTableColumns;
}

function normalizeInvoiceSettings(value: unknown) {
  const settings = value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
  const language: InvoiceSettingsLanguage =
    settings.language === "ru" || settings.language === "lv" || settings.language === "en"
      ? settings.language
      : "lv";
  const paymentTermDays = Number(settings.paymentTermDays);
  const defaultVatRate = Number(settings.defaultVatRate);

  return {
    numberPrefix: firstString(settings.numberPrefix),
    numberPattern: firstString(settings.numberPattern, "YYYY/MM/###"),
    invoiceNumberParts: normalizeInvoiceNumberParts(settings.invoiceNumberParts),
    invoiceNumberSeparator: firstString(settings.invoiceNumberSeparator, "/"),
    invoiceNumberSeparators: normalizeInvoiceNumberSeparators(settings.invoiceNumberSeparators),
    language,
    currency: firstString(settings.currency, "EUR").toUpperCase(),
    logoDataUrl: normalizeInvoiceLogoDataUrl(settings.logoDataUrl),
    logoHidden: settings.logoHidden === true,
    accentColor: normalizeInvoiceAccentColor(settings.accentColor) || "#ef3340",
    providerAddress: firstString(settings.providerAddress),
    overrideBankName: firstString(settings.overrideBankName),
    overrideBankAccountIban: firstString(settings.overrideBankAccountIban),
    overrideBankSwift: firstString(settings.overrideBankSwift),
    overrideBankBeneficiary: firstString(settings.overrideBankBeneficiary),
    providerSignerName: firstString(settings.providerSignerName),
    providerSignerTitle: firstString(settings.providerSignerTitle),
    paymentTermDays: Number.isFinite(paymentTermDays) && paymentTermDays >= 0 ? Math.trunc(paymentTermDays) : 10,
    defaultServiceName: firstString(settings.defaultServiceName, "Apsaimniekošanas pakalpojumi"),
    defaultVatRate: Number.isFinite(defaultVatRate) && defaultVatRate >= 0 ? Math.round(defaultVatRate * 100) / 100 : 0,
    invoiceLineItems: normalizeInvoiceLineItems(settings.invoiceLineItems),
    invoiceTableColumns: normalizeInvoiceTableColumns(settings.invoiceTableColumns),
    showAmountWords: settings.showAmountWords !== false,
    amountWordsPrefix: firstString(settings.amountWordsPrefix, "Summa vārdiem:"),
    showSignature: settings.showSignature !== false,
    footerNote: firstString(settings.footerNote),
  };
}

function normalizeApiKeyItems(value: unknown): CompanyApiKeyItem[] {
  const items = Array.isArray(value) ? value : [];

  return items
    .filter((item): item is UnknownRecord => item !== null && typeof item === "object")
    .map((item) => ({
      id: firstString(item.id),
      label: firstString(item.label, "Invoice upload API key"),
      trackingId: firstString(item.trackingId, item.id ? `key_${String(item.id).slice(0, 16)}` : ""),
      keyPrefix: firstString(item.keyPrefix),
      buildingId: firstString(item.buildingId) || null,
      buildingName: firstString(item.buildingName) || null,
      status: firstString(item.status, "active"),
      scopes: Array.isArray(item.scopes) ? item.scopes.filter((scope): scope is string => typeof scope === "string") : [],
      permission: firstString(item.permission, "all"),
      ownerType: firstString(item.ownerType, "user"),
      createdAt: firstString(item.createdAt) || null,
      revokedAt: firstString(item.revokedAt) || null,
      lastUsedAt: firstString(item.lastUsedAt) || null,
      createdByUid: firstString(item.createdByUid) || null,
    }))
    .filter((item) => item.id);
}

function resolveCompanyMemberType(memberId: string, companyId: string, managerIds: string[], employeeIds: string[]): CompanyMemberType {
  if (memberId === companyId || managerIds.includes(memberId)) return "manager";
  if (employeeIds.includes(memberId)) return "employee";
  return "employee";
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const params = (await searchParams) ?? {};
  const data = await getSettingsPageData(params.role);
  const profile = data.profile;

  const userId = firstString(profile?.uid, profile?.id, data.userId);
  const email = firstString(profile?.email, "kargini@inbox.lv");
  const fullName = firstString(joinNameParts(profile), email.split("@")[0], "DENISS KARGINS");
  const userName = fullName.toUpperCase();
  const username = fullName;
  const phone = firstString(profile?.phone, profile?.phoneNumber, profile?.mobile, profile?.telephone, "");
  const personalCode = maskPersonalCode(firstString(profile?.personalCode, profile?.identityCode));
  const notificationSettings = normalizeNotificationSettings(profile?.notificate ?? profile?.notificationSettings);
  const companyId = firstString(data.companyId, profile?.companyId, userId);
  const accountType = firstString(profile?.accountType, profile?.role);
  const normalizedAccountType = normalizeAccessValue(accountType);
  const canViewCompany =
    data.role === "managementCompany" &&
    (normalizedAccountType === "" || normalizedAccountType === "managementcompany");
  const hasElectricityEnabled = data.buildings.some(isElectricityEnabledBuilding);
  let company: UnknownRecord | null = null;
  let apiKeys: CompanyApiKeyItem[] = [];

  if (canViewCompany && companyId) {
    const [companyResult, apiKeysResult] = await Promise.all([
      apiFetch<UnknownRecord>(`/company/${encodeURIComponent(companyId)}`).catch(() => null),
      apiFetch<{ items?: unknown[] }>(`/company/${encodeURIComponent(companyId)}/api-keys`).catch(() => ({ items: [] })),
    ]);

    company = companyResult;
    apiKeys = normalizeApiKeyItems(apiKeysResult.items);
  }

  const staffContacts = Array.isArray(company?.staffContacts)
    ? company.staffContacts.filter((item): item is UnknownRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
  const currentUserPermissions =
    company?.currentUserPermissions && typeof company.currentUserPermissions === "object"
      ? company.currentUserPermissions as Partial<CompanyMemberPermissions> & { isMainManager?: boolean }
      : {};
  const memberPermissions =
    company?.memberPermissions && typeof company.memberPermissions === "object"
      ? company.memberPermissions as Record<string, Partial<CompanyMemberPermissions>>
      : {};
  const managerIds = Array.isArray(company?.manager)
    ? company.manager.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const employeeIds = Array.isArray(company?.employees)
    ? company.employees.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  const normalizeMemberPermissionFlags = (value?: Partial<CompanyMemberPermissions>): CompanyMemberPermissions => ({
    viewCompanyInfo: value?.viewCompanyInfo !== false,
    editCompanyInfo: value?.editCompanyInfo === true,
    manageMembers: value?.manageMembers === true,
    manageApiKeys: value?.manageApiKeys === true,
    manageInvoiceSettings: value?.manageInvoiceSettings === true,
  });

  return (
    <div className="w-full">
      <SettingsTabs
        user={{
          userName,
          userId,
          email,
          username,
          phone,
          personalCode,
        }}
        notificationSettings={notificationSettings}
        company={{
          canManage: currentUserPermissions.editCompanyInfo === true,
          companyId,
          name: firstString(company?.companyName, company?.name, profile?.companyName, fullName),
          registrationNumber: firstString(company?.registrationNumber, profile?.registrationNumber),
          address: firstString(company?.address, company?.companyAddress, profile?.address, profile?.companyAddress),
          email: firstString(company?.companyEmail, company?.email, company?.contactEmail, profile?.companyEmail, email),
          phone: firstString(company?.companyPhone, company?.phone, company?.contactPhone, profile?.companyPhone),
          bankName: firstString(company?.bankName, profile?.bankName),
          bankAccountIban: firstString(company?.bankAccountIban, company?.iban, profile?.bankAccountIban, profile?.iban),
          bankSwift: firstString(company?.bankSwift, company?.swift, company?.bic, profile?.bankSwift, profile?.swift, profile?.bic),
          bankBeneficiary: firstString(company?.bankBeneficiary, company?.beneficiaryName, profile?.bankBeneficiary, profile?.beneficiaryName),
          invoiceSettings: normalizeInvoiceSettings(company?.invoiceSettings),
          hasElectricityEnabled,
          apiKeys: currentUserPermissions.manageApiKeys === true ? apiKeys : [],
          permissions: {
            isMainManager: currentUserPermissions.isMainManager === true,
            viewCompanyInfo: currentUserPermissions.viewCompanyInfo !== false,
            editCompanyInfo: currentUserPermissions.editCompanyInfo === true,
            manageMembers: currentUserPermissions.manageMembers === true,
            manageApiKeys: currentUserPermissions.manageApiKeys === true,
            manageInvoiceSettings: currentUserPermissions.manageInvoiceSettings === true,
          },
          buildings: data.buildings
            .filter(isApprovedBuilding)
            .map((building) => ({
              id: building.id,
              name: building.name,
              address: building.address,
            })),
          members: data.residents
            .filter((item) => item.role === "ManagementCompany" || item.role === "Accountant")
            .map((item) => ({
              id: item.id,
              email: item.email ?? "",
              name: item.fullName,
              phone: item.phone ?? "",
              position: firstString(item.position, item.jobTitle, item.comment),
              showContactToResidents: item.showContactToResidents === true,
              createAccount: true,
              role: item.role,
              memberType: resolveCompanyMemberType(item.id, companyId, managerIds, employeeIds),
              permissions: normalizeMemberPermissionFlags(memberPermissions[item.id]),
            }))
            .concat(staffContacts.map((item) => ({
              id: firstString(item.id, item.email),
              email: firstString(item.email),
              name: firstString(item.fullName, item.name, [item.firstName, item.lastName].filter((value) => typeof value === "string" && value.trim()).join(" ")),
              phone: firstString(item.phone),
              position: firstString(item.position, item.jobTitle),
              comment: firstString(item.comment),
              showContactToResidents: item.showContactToResidents === true,
              createAccount: item.createAccount !== true ? false : true,
              role: firstString(item.role, "ManagementCompany"),
              memberType: "contact",
              permissions: normalizeMemberPermissionFlags(),
            }))),
        }}
      />
    </div>
  );
}
