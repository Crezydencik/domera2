import type { CompanyApiKeyItem, CompanyMemberPermissions } from "@/shared/api/company";
import type { NotificationSettings } from "@/shared/api/notifications";

export type SettingsTab =
  | "user"
  | "company"
  | "apiKey"
  | "invoiceGeneration"
  | "emailTemplates"
  | "emailBranding"
  | "notifications"
  | "contacts"
  | "billing"
  | "additionalUsers"
  | "dataManagement";

export type UserSettings = {
  userId: string;
  userName: string;
  email: string;
  username: string;
  phone: string;
  personalCode: string;
};

export type InvoiceNumberPart = "companyCode" | "apartmentNumber" | "month" | "year" | "date" | "sequence";
export type InvoiceLineItem = "electricityAdvance" | "electricityPayment" | "other";
export type InvoiceTableColumn = "period" | "price" | "amount" | "unit" | "vat" | "sum" | "recalculation" | "net";

export type InvoiceGenerationSettings = {
  numberPrefix: string;
  numberPattern: string;
  invoiceNumberParts: InvoiceNumberPart[];
  invoiceNumberSeparator: string;
  invoiceNumberSeparators: Partial<Record<InvoiceNumberPart, string>>;
  language: "ru" | "lv" | "en";
  currency: string;
  logoDataUrl: string;
  logoHidden: boolean;
  accentColor: string;
  emailLineColor: string;
  emailButtonColor: string;
  emailHeadingColor: string;
  emailHeading2Color: string;
  emailHeading3Color: string;
  emailTextColor: string;
  emailInvoiceVisibleRows: string[];
  providerAddress: string;
  overrideBankName: string;
  overrideBankAccountIban: string;
  overrideBankSwift: string;
  overrideBankBeneficiary: string;
  providerSignerName: string;
  providerSignerTitle: string;
  paymentTermDays: number;
  defaultServiceName: string;
  defaultVatRate: number;
  invoiceLineItems: InvoiceLineItem[];
  invoiceTableColumns: InvoiceTableColumn[];
  showAmountWords: boolean;
  amountWordsPrefix: string;
  showSignature: boolean;
  footerNote: string;
};

export type CompanyAccessBuilding = { id: string; name: string; address: string };

export type CompanyMember = {
  id: string;
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  position?: string;
  comment?: string;
  showContactToResidents?: boolean;
  createAccount?: boolean;
  role: string;
  memberType?: "manager" | "employee" | "contact";
  permissions?: CompanyMemberPermissions;
};

export type CompanyMemberPermissionFlags = CompanyMemberPermissions & { isMainManager: boolean };

export type CompanySettings = {
  canManage: boolean;
  companyId: string;
  name: string;
  emailBrandName: string;
  registrationNumber: string;
  address: string;
  email: string;
  phone: string;
  bankName: string;
  bankAccountIban: string;
  bankSwift: string;
  bankBeneficiary: string;
  invoiceSettings: InvoiceGenerationSettings;
  hasElectricityEnabled: boolean;
  apiKeys: CompanyApiKeyItem[];
  buildings: CompanyAccessBuilding[];
  members: CompanyMember[];
  permissions: CompanyMemberPermissionFlags;
};

export type SettingsTabsProps = {
  user: UserSettings;
  notificationSettings: NotificationSettings;
  company?: CompanySettings;
  isAccountant?: boolean;
  initialTab?: SettingsTab;
  hideTabs?: boolean;
};

export type EditableField = "email" | "name" | "phone" | "password" | null;
export type EditableCompanyField = "name" | "registrationNumber" | "address" | "email" | "phone" | null;
export type BankDetailsField = "bankName" | "bankAccountIban" | "bankSwift" | "bankBeneficiary";
export type InvoiceGenerationAccordionKey = "branding" | "numbering" | "bankDetails" | "provider" | "amounts" | "footer";
export type PreviewInvoiceRow =
  | { type: "group"; service: string }
  | { service: string; period: string; price: number; amount: number; unit: string };
export type CompanyMemberPermissionKey = keyof CompanyMemberPermissions;
export type NameDraft = { firstName: string; lastName: string };
export type PasswordDraft = { current: string; next: string; repeat: string };
export type VisiblePasswordField = keyof PasswordDraft;
export type CompanyDraft = Pick<CompanySettings, "companyId" | "name" | "registrationNumber" | "address" | "email" | "phone" | "bankName" | "bankAccountIban" | "bankSwift" | "bankBeneficiary">;
export type CompanyMemberRole = "ManagementCompany" | "Accountant";
