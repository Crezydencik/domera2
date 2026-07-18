"use client";

import { useLocale } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { FiCheckCircle, FiChevronDown, FiSettings, FiTrash2, FiX } from "react-icons/fi";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { updateBuilding } from "@/shared/api/buildings";
import { uploadInvoice } from "@/shared/api/billing";
import { apiFetch } from "@/shared/api/client";
import { useNotifications } from "@/shared/hooks/use-notifications";
import { isElectricityEnabledBuilding } from "@/shared/lib/buildings";
import { notifyBuildingsChanged } from "@/shared/lib/buildings-events";
import { ROUTES } from "@/shared/lib/routes";
import type { Building, Invoice, NotificationItem } from "@/shared/lib/data";
import type { DashboardRole } from "@/shared/role-ui";

type RawRecord = Record<string, unknown>;
type InvoiceNumberPart = "companyCode" | "apartmentNumber" | "month" | "year" | "date" | "sequence";
type InvoiceLineItem = "electricityAdvance" | "electricityPayment" | "other";
type InvoiceTableColumn = "period" | "price" | "amount" | "unit" | "vat" | "sum" | "recalculation" | "net";

type CompanyInvoiceProfile = {
  companyId?: string;
  name?: string;
  registrationNumber?: string;
  address?: string;
  bankName?: string;
  bankAccountIban?: string;
  bankSwift?: string;
  bankBeneficiary?: string;
  invoiceSettings?: unknown;
};

type InvoiceGenerationSettings = {
  numberPrefix: string;
  numberPattern: string;
  invoiceNumberParts: InvoiceNumberPart[];
  invoiceNumberSeparator: string;
  invoiceNumberSeparators: Partial<Record<InvoiceNumberPart, string>>;
  currency: string;
  logoDataUrl: string;
  logoHidden: boolean;
  accentColor: string;
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

type ApartmentOption = {
  id: string;
  label: string;
  buildingId: string;
};

type ElectricityPayment = {
  id: string;
  apartmentId: string;
  amount: number;
  paidKwh: number;
  paidAt: string;
  note: string;
  confirmed: boolean;
};

type ElectricityRecordType = "advance" | "invoice";

type ElectricityRecord = {
  id: string;
  type: ElectricityRecordType;
  invoiceId?: string;
  approvalId?: string;
  apartmentId: string;
  amount: number;
  kwh: number;
  date: string;
  status: string;
  confirmed: boolean;
  note: string;
  payment?: ElectricityPayment;
};

type ElectricityReadingInfo = {
  latestReadingId: string;
  meterId: string;
  meterDigits?: number;
  previousValue: number | null;
  currentValue: number | null;
  consumption: number;
  hasPrevious: boolean;
};

const COPY = {
  en: {
    title: "Electricity",
    description: "Advance payments, consumption invoices, and confirmations for the selected building",
    building: "Building",
    apartment: "Apartment",
    chooseBuilding: "Choose building",
    chooseApartment: "Choose apartment",
    tariff: "Tariff",
    pending: "Waiting for confirmation",
    confirmed: "Confirmed",
    noPayments: "No electricity advance payments yet.",
    noRecords: "No electricity records for the selected filters.",
    noEnabledBuildings: "Electricity readings are not enabled for any approved building.",
    actions: "Actions",
    settingsTitle: "Electricity settings",
    meterDigits: "Reading cells",
    userSetsDigits: "Resident chooses cells on first submission",
    allowMultipleMonthly: "Allow multiple readings per month",
    fixedPrice: "Fixed electricity price per kWh",
    pricePerKwh: "Electricity price per kWh",
    saveSettings: "Save settings",
    settingsSaved: "Electricity settings saved.",
    settingsSaveFailed: "Could not save electricity settings.",
    invalidDigits: "Reading cells must be from 5 to 7.",
    invalidPrice: "Electricity price per kWh must be greater than 0.",
    kwh: "kWh",
    amount: "Amount",
    paymentDate: "Payment date",
    status: "Status",
    type: "Type",
    allTypes: "All types",
    advanceType: "Advance",
    invoiceType: "Invoice",
    allApartments: "All apartments",
    period: "Period",
    currentMonth: "Current month",
    customPeriod: "Custom period",
    fromMonth: "From",
    toMonth: "To",
    acceptAdvance: "Accept advance",
    issueInvoice: "Issue invoice",
    advanceTitle: "Accept electricity advance",
    advanceDescription: "Choose an apartment and enter paid kWh. The amount is calculated from the tariff.",
    consumptionTitle: "Issue consumed electricity invoice",
    consumptionDescription: "Choose an apartment and enter the current actual reading. Consumption and amount are calculated automatically.",
    previousReading: "Previous reading",
    currentReading: "Current reading",
    nextReading: "Next reading",
    availableAdvance: "Available advance",
    coveredByAdvance: "From advance",
    billableKwh: "Billable kWh",
    saveStart: "Save starting value",
    startSaved: "Starting value saved. The next reading will be calculated from it.",
    currentRequired: "Enter the current actual reading.",
    calculatedAmount: "Calculated amount",
    saving: "Saving...",
    apartmentRequired: "Choose an apartment.",
    kwhRequired: "Enter kWh.",
    tariffMissing: "Electricity tariff is not configured.",
    noApartments: "No apartments are available for this building.",
    meterDigitsMissing: "Set electricity reading cells in settings, or allow the resident to choose them on first submission.",
    setupRequired: "Electricity setup needs attention",
    openSettings: "Open settings",
    advanceCreated: "Electricity advance accepted.",
    advanceCreateFailed: "Could not accept electricity advance.",
    invoiceCreated: "Electricity invoice issued.",
    invoiceCreateFailed: "Could not issue electricity invoice.",
    confirm: "Confirm",
    confirming: "Confirming...",
    confirmedToast: "Electricity payment confirmed.",
    confirmFailed: "Could not confirm electricity payment.",
    close: "Close",
    loading: "Loading...",
  },
  ru: {
    title: "Электричество",
    description: "Авансы, счета за потребление и подтверждения по выбранному дому",
    building: "Дом",
    apartment: "Квартира",
    chooseBuilding: "Выберите дом",
    chooseApartment: "Выберите квартиру",
    tariff: "Тариф",
    pending: "Ожидает подтверждения",
    confirmed: "Подтверждено",
    noPayments: "Авансов по электричеству пока нет.",
    noRecords: "По выбранным фильтрам записей электричества нет.",
    noEnabledBuildings: "Показания электричества не включены ни в одном подтвержденном доме.",
    actions: "Действия",
    settingsTitle: "Настройки электричества",
    meterDigits: "Ячеек для показания",
    userSetsDigits: "Житель выбирает количество ячеек при первой подаче",
    allowMultipleMonthly: "Разрешить несколько показаний в месяц",
    fixedPrice: "Фиксированная цена за kWh",
    pricePerKwh: "Цена электричества за kWh",
    saveSettings: "Сохранить настройки",
    settingsSaved: "Настройки электричества сохранены.",
    settingsSaveFailed: "Не удалось сохранить настройки электричества.",
    invalidDigits: "Количество ячеек должно быть от 5 до 7.",
    invalidPrice: "Цена электричества за kWh должна быть больше 0.",
    kwh: "kWh",
    amount: "Сумма",
    paymentDate: "Дата оплаты",
    status: "Статус",
    type: "Тип",
    allTypes: "Все типы",
    advanceType: "Аванс",
    invoiceType: "Счёт",
    allApartments: "Все квартиры",
    period: "Период",
    currentMonth: "Текущий месяц",
    customPeriod: "Произвольный период",
    fromMonth: "С",
    toMonth: "По",
    acceptAdvance: "Принять аванс",
    issueInvoice: "Выставить счёт",
    advanceTitle: "Принять аванс за электричество",
    advanceDescription: "Выберите квартиру и введите оплаченные kWh. Сумма рассчитается по тарифу.",
    consumptionTitle: "Выставить счёт за потреблённое электричество",
    consumptionDescription: "Выберите квартиру и введите текущее актуальное показание. Расход и сумма считаются автоматически.",
    previousReading: "Предыдущее показание",
    currentReading: "Текущее показание",
    nextReading: "Следующее показание",
    availableAdvance: "Доступный аванс",
    coveredByAdvance: "С аванса",
    billableKwh: "kWh к оплате",
    saveStart: "Сохранить стартовое значение",
    startSaved: "Стартовое значение сохранено. Следующее показание будет считаться от него.",
    currentRequired: "Введите текущее актуальное показание.",
    calculatedAmount: "Рассчитанная сумма",
    saving: "Сохраняем...",
    apartmentRequired: "Выберите квартиру.",
    kwhRequired: "Введите kWh.",
    tariffMissing: "Тариф электричества не настроен.",
    noApartments: "Для этого дома нет доступных квартир.",
    meterDigitsMissing: "Задайте ячейки показания электричества в настройках или разрешите жителю выбрать их при первой подаче.",
    setupRequired: "Нужно настроить электричество",
    openSettings: "Открыть настройки",
    advanceCreated: "Аванс за электричество принят.",
    advanceCreateFailed: "Не удалось принять аванс за электричество.",
    invoiceCreated: "Счёт за электричество выставлен.",
    invoiceCreateFailed: "Не удалось выставить счёт за электричество.",
    confirm: "Подтвердить",
    confirming: "Подтверждаем...",
    confirmedToast: "Платеж за электричество подтвержден.",
    confirmFailed: "Не удалось подтвердить платеж за электричество.",
    close: "Закрыть",
    loading: "Загрузка...",
  },
  lv: {
    title: "Elektrība",
    description: "Avansi, patēriņa rēķini un apstiprinājumi izvēlētajai ēkai",
    building: "Ēka",
    apartment: "Dzīvoklis",
    chooseBuilding: "Izvēlieties ēku",
    chooseApartment: "Izvēlieties dzīvokli",
    tariff: "Tarifs",
    pending: "Gaida apstiprinājumu",
    confirmed: "Apstiprināts",
    noPayments: "Elektrības avansa maksājumu vēl nav.",
    noRecords: "Izvēlētajiem filtriem elektrības ierakstu nav.",
    noEnabledBuildings: "Elektrības rādījumi nav ieslēgti nevienai apstiprinātai ēkai.",
    actions: "Darbības",
    settingsTitle: "Elektrības iestatījumi",
    meterDigits: "Rādījuma šūnas",
    userSetsDigits: "Iedzīvotājs izvēlas šūnu skaitu pirmajā iesniegšanā",
    allowMultipleMonthly: "Atļaut vairākus rādījumus mēnesī",
    fixedPrice: "Fiksēta elektrības cena par kWh",
    pricePerKwh: "Elektrības cena par kWh",
    saveSettings: "Saglabāt iestatījumus",
    settingsSaved: "Elektrības iestatījumi saglabāti.",
    settingsSaveFailed: "Neizdevās saglabāt elektrības iestatījumus.",
    invalidDigits: "Rādījuma šūnu skaitam jābūt no 5 līdz 7.",
    invalidPrice: "Elektrības cenai par kWh jābūt lielākai par 0.",
    kwh: "kWh",
    amount: "Summa",
    paymentDate: "Maksājuma datums",
    status: "Statuss",
    type: "Tips",
    allTypes: "Visi tipi",
    advanceType: "Avanss",
    invoiceType: "Rēķins",
    allApartments: "Visi dzīvokļi",
    period: "Periods",
    currentMonth: "Pašreizējais mēnesis",
    customPeriod: "Brīvs periods",
    fromMonth: "No",
    toMonth: "Līdz",
    acceptAdvance: "Pieņemt avansu",
    issueInvoice: "Izrakstīt rēķinu",
    advanceTitle: "Pieņemt elektrības avansu",
    advanceDescription: "Izvēlieties dzīvokli un ievadiet apmaksātos kWh. Summa tiks aprēķināta pēc tarifa.",
    consumptionTitle: "Izrakstīt rēķinu par patērēto elektrību",
    consumptionDescription: "Izvēlieties dzīvokli un ievadiet pašreizējo aktuālo rādījumu. Patēriņš un summa tiek aprēķināta automātiski.",
    previousReading: "Iepriekšējais rādījums",
    currentReading: "Pašreizējais rādījums",
    nextReading: "Nākamais rādījums",
    availableAdvance: "Pieejamais avanss",
    coveredByAdvance: "No avansa",
    billableKwh: "Apmaksai kWh",
    saveStart: "Saglabāt sākuma vērtību",
    startSaved: "Sākuma vērtība saglabāta. Nākamais rādījums tiks aprēķināts no tās.",
    currentRequired: "Ievadiet pašreizējo aktuālo rādījumu.",
    calculatedAmount: "Aprēķinātā summa",
    saving: "Saglabā...",
    apartmentRequired: "Izvēlieties dzīvokli.",
    kwhRequired: "Ievadiet kWh.",
    tariffMissing: "Elektrības tarifs nav iestatīts.",
    noApartments: "Šai ēkai nav pieejamu dzīvokļu.",
    meterDigitsMissing: "Iestatiet elektrības rādījuma šūnas vai ļaujiet iedzīvotājam tās izvēlēties pirmajā iesniegšanā.",
    setupRequired: "Elektrības iestatījumiem jāpievērš uzmanība",
    openSettings: "Atvērt iestatījumus",
    advanceCreated: "Elektrības avanss pieņemts.",
    advanceCreateFailed: "Neizdevās pieņemt elektrības avansu.",
    invoiceCreated: "Elektrības rēķins izrakstīts.",
    invoiceCreateFailed: "Neizdevās izrakstīt elektrības rēķinu.",
    confirm: "Apstiprināt",
    confirming: "Apstiprina...",
    confirmedToast: "Elektrības maksājums apstiprināts.",
    confirmFailed: "Neizdevās apstiprināt elektrības maksājumu.",
    close: "Aizvērt",
    loading: "Ielādē...",
  },
} as const;

type Copy = { readonly [Key in keyof typeof COPY.en]: string };

const invoiceNumberPartOptions: InvoiceNumberPart[] = ["companyCode", "apartmentNumber", "month", "year", "date", "sequence"];
const invoiceLineItemOptions: InvoiceLineItem[] = ["electricityAdvance", "electricityPayment", "other"];
const invoiceTableColumnOptions: InvoiceTableColumn[] = ["period", "price", "amount", "unit", "vat", "sum", "recalculation", "net"];
const defaultInvoiceLineItems: InvoiceLineItem[] = ["electricityAdvance", "electricityPayment", "other"];
const defaultInvoiceTableColumns: InvoiceTableColumn[] = ["period", "price", "amount", "unit", "sum", "recalculation"];
const defaultInvoiceGenerationSettings: InvoiceGenerationSettings = {
  numberPrefix: "",
  numberPattern: "YYYY/MM/###",
  invoiceNumberParts: [],
  invoiceNumberSeparator: "/",
  invoiceNumberSeparators: {},
  currency: "EUR",
  logoDataUrl: "",
  logoHidden: false,
  accentColor: "#ef3340",
  providerAddress: "",
  overrideBankName: "",
  overrideBankAccountIban: "",
  overrideBankSwift: "",
  overrideBankBeneficiary: "",
  providerSignerName: "",
  providerSignerTitle: "",
  paymentTermDays: 10,
  defaultServiceName: "Maksa par patereto elektroenergiju",
  defaultVatRate: 0,
  invoiceLineItems: defaultInvoiceLineItems,
  invoiceTableColumns: defaultInvoiceTableColumns,
  showAmountWords: true,
  amountWordsPrefix: "Summa vardiem:",
  showSignature: true,
  footerNote: "",
};

function getCopy(locale: string): Copy {
  if (locale.startsWith("ru")) return COPY.ru;
  if (locale.startsWith("lv")) return COPY.lv;
  return COPY.en;
}

function asRecord(value: unknown): RawRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RawRecord) : {};
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function numberValue(value: unknown) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeInvoiceAccentColor(value: unknown) {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value.trim()) ? value.trim() : "";
}

function normalizeInvoiceLogoDataUrl(value: unknown) {
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
      .map((part) => [part, (value as RawRecord)[part]] as const)
      .filter((entry): entry is readonly [InvoiceNumberPart, string] => typeof entry[1] === "string"),
  );
}

function normalizeInvoiceLineItems(value: unknown): InvoiceLineItem[] {
  const items = Array.isArray(value)
    ? value.filter((item): item is InvoiceLineItem =>
      typeof item === "string" && invoiceLineItemOptions.includes(item as InvoiceLineItem),
    )
    : [];
  return items.length > 0 ? invoiceLineItemOptions.filter((item) => items.includes(item)) : defaultInvoiceLineItems;
}

function normalizeInvoiceTableColumns(value: unknown): InvoiceTableColumn[] {
  const columns = Array.isArray(value)
    ? value.filter((item): item is InvoiceTableColumn =>
      typeof item === "string" && invoiceTableColumnOptions.includes(item as InvoiceTableColumn),
    )
    : [];
  return columns.length > 0 ? invoiceTableColumnOptions.filter((item) => columns.includes(item)) : defaultInvoiceTableColumns;
}

function normalizeInvoiceGenerationSettings(value: unknown): InvoiceGenerationSettings {
  const source = asRecord(value);
  const paymentTermDays = numberValue(source.paymentTermDays);
  const defaultVatRate = numberValue(source.defaultVatRate);
  return {
    numberPrefix: firstString(source.numberPrefix, defaultInvoiceGenerationSettings.numberPrefix),
    numberPattern: firstString(source.numberPattern, defaultInvoiceGenerationSettings.numberPattern),
    invoiceNumberParts: normalizeInvoiceNumberParts(source.invoiceNumberParts),
    invoiceNumberSeparator: firstString(source.invoiceNumberSeparator, defaultInvoiceGenerationSettings.invoiceNumberSeparator),
    invoiceNumberSeparators: normalizeInvoiceNumberSeparators(source.invoiceNumberSeparators),
    currency: firstString(source.currency, defaultInvoiceGenerationSettings.currency).toUpperCase(),
    logoDataUrl: normalizeInvoiceLogoDataUrl(source.logoDataUrl),
    logoHidden: source.logoHidden === true,
    accentColor: normalizeInvoiceAccentColor(source.accentColor) || defaultInvoiceGenerationSettings.accentColor,
    providerAddress: firstString(source.providerAddress),
    overrideBankName: firstString(source.overrideBankName),
    overrideBankAccountIban: firstString(source.overrideBankAccountIban),
    overrideBankSwift: firstString(source.overrideBankSwift),
    overrideBankBeneficiary: firstString(source.overrideBankBeneficiary),
    providerSignerName: firstString(source.providerSignerName),
    providerSignerTitle: firstString(source.providerSignerTitle),
    paymentTermDays: Number.isFinite(paymentTermDays) && paymentTermDays >= 0 ? Math.trunc(paymentTermDays) : defaultInvoiceGenerationSettings.paymentTermDays,
    defaultServiceName: firstString(source.defaultServiceName, defaultInvoiceGenerationSettings.defaultServiceName),
    defaultVatRate: Number.isFinite(defaultVatRate) && defaultVatRate >= 0 ? Math.round(defaultVatRate * 100) / 100 : defaultInvoiceGenerationSettings.defaultVatRate,
    invoiceLineItems: normalizeInvoiceLineItems(source.invoiceLineItems),
    invoiceTableColumns: normalizeInvoiceTableColumns(source.invoiceTableColumns),
    showAmountWords: source.showAmountWords !== false,
    amountWordsPrefix: firstString(source.amountWordsPrefix, defaultInvoiceGenerationSettings.amountWordsPrefix),
    showSignature: source.showSignature !== false,
    footerNote: firstString(source.footerNote),
  };
}

function electricityDigitsValue(value: unknown) {
  const parsed = Math.floor(numberValue(value) || 6);
  return Math.min(7, Math.max(5, parsed));
}

function moneyValue(value: unknown) {
  const raw = String(value ?? "").replace(",", ".");
  const match = raw.match(/\d+(?:\.\d+)?/);
  return match ? numberValue(match[0]) : 0;
}

function electricityInvoiceKwh(invoice: Invoice) {
  const raw = `${invoice.comment ?? ""} ${invoice.externalId ?? ""}`;
  const match = raw.match(/(\d+(?:[.,]\d+)?)\s*kwh/i);
  return match ? numberValue(match[1]) : 0;
}

function electricityAdvanceUsedKwh(value: unknown) {
  const raw = firstString(value);
  const match = raw.match(/advance\s+(\d+(?:[.,]\d+)?)\s*kwh/i);
  return match ? numberValue(match[1]) : 0;
}

function electricitySetupNotificationFromBuilding(building: Building): NotificationItem | null {
  if (!isElectricityEnabledBuilding(building)) return null;

  const buildingLabel = firstString(building.name, building.address, building.id);
  const electricityPrice = Math.max(0, numberValue(building.readingConfig?.electricityPricePerKwh));
  const rawDigits = building.readingConfig?.electricityMeterDigits;
  const digits = numberValue(rawDigits);
  const residentCanChooseDigits = Boolean(building.readingConfig?.electricityUserSetsDigits);
  const messages: string[] = [];

  if (electricityPrice <= 0) {
    messages.push("Electricity tariff is not configured");
  }

  if (!residentCanChooseDigits && (digits < 5 || digits > 7)) {
    messages.push("Electricity reading cells are not set");
  }

  if (!messages.length) return null;

  return {
    id: `electricity-setup-local-${building.id || buildingLabel}`,
    title: "Electricity setup needs attention",
    description: `${buildingLabel}: ${messages.join("; ")}.`,
    channel: "Electricity",
    actionHref: `${ROUTES.electricity}?settings=1`,
    actionLabel: "Open settings",
    type: "electricity-setup",
    buildingName: buildingLabel,
  };
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function currentPeriodValue() {
  return new Date().toISOString().slice(0, 7);
}

function formatDate(value: unknown) {
  const raw = firstString(value);
  if (!raw) return "-";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toISOString().slice(0, 10);
}

function formatMoney(value: number, currency = "EUR") {
  return `${value.toFixed(2)} ${currency}`;
}

function pdfText(value: unknown) {
  return firstString(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function pdfNumber(value: number, fractionDigits: number) {
  return value.toLocaleString("lv-LV", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function lvNumberWords(value: number): string {
  const ones = ["nulle", "viens", "divi", "tris", "cetri", "pieci", "sesi", "septini", "astoni", "devini"];
  const teens = ["desmit", "vienpadsmit", "divpadsmit", "trispadsmit", "cetrpadsmit", "piecpadsmit", "sespadsmit", "septinpadsmit", "astonpadsmit", "devinpadsmit"];
  const tens = ["", "", "divdesmit", "trisdesmit", "cetrdesmit", "piecdesmit", "sesdesmit", "septindesmit", "astondesmit", "devindesmit"];

  function underThousand(amount: number): string {
    const parts: string[] = [];
    const hundreds = Math.floor(amount / 100);
    const rest = amount % 100;
    if (hundreds > 0) parts.push(hundreds === 1 ? "viens simts" : `${ones[hundreds]} simti`);
    if (rest >= 20) {
      const ten = Math.floor(rest / 10);
      const one = rest % 10;
      parts.push(tens[ten]);
      if (one > 0) parts.push(ones[one]);
    } else if (rest >= 10) {
      parts.push(teens[rest - 10]);
    } else if (rest > 0 || parts.length === 0) {
      parts.push(ones[rest]);
    }
    return parts.join(" ");
  }

  const normalized = Math.max(0, Math.floor(value));
  if (normalized < 1000) return underThousand(normalized);
  const thousands = Math.floor(normalized / 1000);
  const rest = normalized % 1000;
  const thousandWord = thousands === 1 ? "viens tukstotis" : `${underThousand(thousands)} tukstosi`;
  return rest > 0 ? `${thousandWord} ${underThousand(rest)}` : thousandWord;
}

function amountWords(value: number, currency: string) {
  const euros = Math.floor(Math.max(0, value));
  const cents = Math.round((Math.max(0, value) - euros) * 100);
  const euroWord = currency.toUpperCase() === "EUR" ? "euro" : currency;
  const centWord = cents === 1 ? "cents" : "centi";
  return `${lvNumberWords(euros)} ${euroWord}${cents > 0 ? ` un ${lvNumberWords(cents)} ${centWord}` : ""}`;
}

function pdfDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}.`;
}

function addDays(value: string, days: number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function hexToRgb(value: string) {
  const hex = normalizeInvoiceAccentColor(value) || defaultInvoiceGenerationSettings.accentColor;
  return {
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255,
  };
}

function pdfFill(hex: string) {
  const color = hexToRgb(hex);
  return `${color.r.toFixed(3)} ${color.g.toFixed(3)} ${color.b.toFixed(3)} rg`;
}

function pdfStroke(hex: string) {
  const color = hexToRgb(hex);
  return `${color.r.toFixed(3)} ${color.g.toFixed(3)} ${color.b.toFixed(3)} RG`;
}

function buildPdf(commands: string[]) {
  const pageWidth = 595;
  const pageHeight = 842;
  const content = [
    "q",
    "1 1 1 rg 0 0 595 842 re f",
    "0 0 0 rg",
    ...commands,
    "Q",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

function pdfTextCommand(text: string, x: number, y: number, size = 10, bold = false) {
  return `BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${pdfText(text)}) Tj ET`;
}

function pdfApproxTextWidth(text: string, size: number) {
  return pdfText(text).length * size * 0.52;
}

function pdfTextRightCommand(text: string, rightX: number, y: number, size = 10, bold = false) {
  return pdfTextCommand(text, Math.max(0, rightX - pdfApproxTextWidth(text, size)), y, size, bold);
}

function pdfTextCenterCommand(text: string, centerX: number, y: number, size = 10, bold = false) {
  return pdfTextCommand(text, Math.max(0, centerX - pdfApproxTextWidth(text, size) / 2), y, size, bold);
}

function pdfLine(x1: number, y1: number, x2: number, y2: number, color = "#d7dee8", width = 0.7) {
  return `${pdfStroke(color)} ${width} w ${x1} ${y1} m ${x2} ${y2} l S`;
}

function pdfRect(x: number, y: number, width: number, height: number, fill: string) {
  return `${pdfFill(fill)} ${x} ${y} ${width} ${height} re f 0 0 0 rg`;
}

function buildConfiguredInvoiceNumber(params: {
  settings: InvoiceGenerationSettings;
  company: CompanyInvoiceProfile;
  apartmentNumber: string;
  invoiceDate: string;
  sequence: number;
}) {
  const date = new Date(params.invoiceDate);
  const year = Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getFullYear();
  const month = Number.isNaN(date.getTime()) ? new Date().getMonth() + 1 : date.getMonth() + 1;
  const day = Number.isNaN(date.getTime()) ? new Date().getDate() : date.getDate();
  const sequence = String(params.sequence).padStart(3, "0");
  const companyDigits = firstString(params.company.registrationNumber, params.company.companyId).replace(/\D/g, "");
  const values: Record<InvoiceNumberPart, string> = {
    companyCode: companyDigits ? companyDigits.slice(-3).padStart(3, "0") : "000",
    apartmentNumber: params.apartmentNumber || "0",
    month: String(month).padStart(2, "0"),
    year: String(year),
    date: `${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`,
    sequence,
  };
  const parts = normalizeInvoiceNumberParts(params.settings.invoiceNumberParts);
  const prefix = params.settings.numberPrefix.trim();

  if (parts.length > 0) {
    const number = parts
      .map((part, index) => `${values[part]}${index < parts.length - 1 ? params.settings.invoiceNumberSeparators[part] ?? "" : ""}`)
      .join("");
    return `${prefix}${number}`;
  }

  const pattern = (params.settings.numberPattern.trim() || defaultInvoiceGenerationSettings.numberPattern)
    .replace(/YYYY/g, String(year))
    .replace(/YY/g, String(year).slice(-2))
    .replace(/MM/g, String(month).padStart(2, "0"))
    .replace(/DD/g, String(day).padStart(2, "0"))
    .replace(/#+/g, (match) => sequence.slice(-match.length).padStart(match.length, "0"));
  return `${prefix}${pattern}`;
}

type TemplateInvoiceRow = {
  service: string;
  period: string;
  price: number;
  quantity: number;
  unit: string;
  sum: number;
};

function buildElectricityInvoicePdf(params: {
  invoiceNumber: string;
  settings: InvoiceGenerationSettings;
  company: CompanyInvoiceProfile;
  buildingAddress: string;
  apartmentLabel: string;
  invoiceDate: string;
  period: string;
  tariff: number;
  consumptionKwh: number;
  advanceKwh: number;
  advanceAmount: number;
  billableKwh: number;
  amount: number;
}) {
  const settings = params.settings;
  const accent = settings.accentColor;
  const currency = settings.currency || "EUR";
  const providerName = firstString(params.company.name, "MATISA 89").toUpperCase();
  const providerAddress = firstString(settings.providerAddress, params.company.address);
  const bankName = firstString(settings.overrideBankName, params.company.bankName);
  const iban = firstString(settings.overrideBankAccountIban, params.company.bankAccountIban);
  const swift = firstString(settings.overrideBankSwift, params.company.bankSwift);
  const beneficiary = firstString(settings.overrideBankBeneficiary, params.company.bankBeneficiary, params.company.name);
  const dueDate = pdfDate(addDays(params.invoiceDate, settings.paymentTermDays));
  const invoiceDate = pdfDate(params.invoiceDate);
  const periodLabel = params.period.length === 7 ? `01.${params.period.slice(5)}. - 31.${params.period.slice(5)}.` : params.period;
  const lines: string[] = [];
  const rows: TemplateInvoiceRow[] = [];
  const hasAdvanceLine = settings.invoiceLineItems.includes("electricityAdvance") && params.advanceAmount > 0;
  if (hasAdvanceLine) {
    rows.push({
      service: "No avansa",
      period: periodLabel,
      price: -params.advanceAmount,
      quantity: 1,
      unit: "gab.",
      sum: -params.advanceAmount,
    });
  }
  if (settings.invoiceLineItems.includes("electricityPayment")) {
    const quantity = hasAdvanceLine ? params.consumptionKwh : params.billableKwh;
    rows.push({
      service: "Maksa par patereto elektroenergiju",
      period: periodLabel,
      price: params.tariff,
      quantity,
      unit: "kWh",
      sum: Number((quantity * params.tariff).toFixed(2)),
    });
  }
  const total = Number(rows.reduce((sum, row) => sum + row.sum, 0).toFixed(2));

  if (!settings.logoHidden) {
    lines.push(pdfTextCommand(providerName, 48, 766, 28, true));
    lines.push(`${pdfStroke(accent)} 4 w 205 769 m 221 785 l 237 769 l 221 753 l h S`);
  }
  if (providerAddress) lines.push(pdfTextCommand(providerAddress, 48, 728, 12, true));
  lines.push(pdfTextCommand(params.apartmentLabel || params.buildingAddress || "-", 48, 704, 12, true));
  lines.push(pdfTextCommand(`Klienta kods: ${firstString(params.company.registrationNumber, params.company.companyId, "-")}`, 48, 688, 11));

  lines.push(pdfTextRightCommand(`${currency} ${pdfNumber(total, 2)}`, 534, 766, 30, true));
  lines.push(pdfTextRightCommand(`Samaksat lidz ${dueDate}`, 534, 735, 12));
  lines.push(pdfTextRightCommand(`Datums ${invoiceDate}`, 534, 718, 12));
  lines.push(pdfRect(392, 688, 142, 7, accent));

  lines.push(pdfTextCommand(`Rekins Nr. ${params.invoiceNumber}`, 48, 650, 22, true));
  const tableX = 48;
  const tableY = 616;
  const tableWidth = 486;
  const columns = settings.invoiceTableColumns;
  const serviceWidth = columns.length >= 6 ? 150 : 210;
  const otherWidth = columns.length > 0 ? (tableWidth - serviceWidth) / columns.length : 0;
  lines.push(pdfRect(tableX, tableY, tableWidth, 18, "#e8e8e8"));
  lines.push(pdfTextCommand("Pakalpojums", tableX + 4, tableY + 6, 8, true));
  columns.forEach((column, index) => {
    const left = tableX + serviceWidth + otherWidth * index;
    const right = left + otherWidth - 4;
    const center = left + otherWidth / 2;
    const label: Record<InvoiceTableColumn, string> = {
      period: "Periods",
      price: `Cena par 1 kWh, ${currency}`,
      amount: "Daudzums",
      unit: "Merv.",
      vat: "PVN",
      sum: "Summa",
      recalculation: "Parrekins",
      net: `Bez PVN, ${currency}`,
    };
    const numericHeader = column === "price" || column === "amount" || column === "vat" || column === "sum" || column === "recalculation" || column === "net";
    lines.push(
      column === "unit"
        ? pdfTextCenterCommand(label[column], center, tableY + 6, 7, true)
        : numericHeader
          ? pdfTextRightCommand(label[column], right, tableY + 6, 7, true)
          : pdfTextCommand(label[column], left + 3, tableY + 6, 7, true),
    );
  });
  lines.push(pdfTextCommand("Elektroenergija", tableX + 4, tableY - 12, 9, true));
  let y = tableY - 30;
  rows.forEach((row) => {
    lines.push(pdfLine(tableX, y + 13, tableX + tableWidth, y + 13));
    lines.push(pdfTextCommand(row.service, tableX + 4, y, 8));
    if (row.unit === "kWh") {
      lines.push(pdfTextCommand(`Cena par 1 kWh: ${pdfNumber(row.price, 5)} ${currency}; paterins: ${pdfNumber(row.quantity, 3)} kWh`, tableX + 4, y - 10, 6));
    }
    columns.forEach((column, index) => {
      const left = tableX + serviceWidth + otherWidth * index;
      const right = left + otherWidth - 4;
      const center = left + otherWidth / 2;
      const value: Record<InvoiceTableColumn, string> = {
        period: row.period,
        price: pdfNumber(row.price, 5),
        amount: pdfNumber(row.quantity, 3),
        unit: row.unit,
        vat: settings.defaultVatRate > 0 ? `${pdfNumber(settings.defaultVatRate, 0)}%` : "",
        sum: pdfNumber(row.sum, 2),
        recalculation: "",
        net: pdfNumber(row.sum, 2),
      };
      const numericColumn = column === "price" || column === "amount" || column === "vat" || column === "sum" || column === "recalculation" || column === "net";
      lines.push(
        column === "unit"
          ? pdfTextCenterCommand(value[column], center, y, 7)
          : numericColumn
            ? pdfTextRightCommand(value[column], right, y, 7)
            : pdfTextCommand(value[column], left + 3, y, 7),
      );
    });
    y -= row.unit === "kWh" ? 30 : 18;
  });
  lines.push(pdfLine(tableX, y + 12, tableX + tableWidth, y + 12, "#b8c2d0", 1));
  if (settings.showAmountWords) {
    lines.push(pdfTextCommand(`${settings.amountWordsPrefix} ${amountWords(total, currency)}`, tableX + 4, y - 6, 9));
  }
  lines.push(pdfTextRightCommand("Kopa aprekinats", tableX + tableWidth - 46, y - 6, 9));
  lines.push(pdfTextRightCommand(pdfNumber(total, 2), tableX + tableWidth - 4, y - 6, 9, true));

  const note = settings.footerNote || `Veicot rekinu apmaksu, obligati noradiet rekina numuru ${params.invoiceNumber} vai klienta kodu ${firstString(params.company.registrationNumber, params.company.companyId, "-")}.`;
  lines.push(pdfTextCommand(note, 48, y - 42, 10));
  lines.push(pdfTextCommand("Maksajums ir uzskatams par veiktu diena, kad naudas lidzekli ienak Parvaldnieka konta.", 48, y - 58, 10));
  lines.push(pdfLine(48, y - 88, 534, y - 88, accent, 1.2));
  lines.push(pdfTextCommand("Apmaksat:", 48, y - 116, 9));
  lines.push(pdfTextCommand("Sanemejs:", 150, y - 116, 9));
  lines.push(pdfTextCommand(beneficiary || providerName, 150, y - 132, 9, true));
  lines.push(pdfTextCommand("Banku konti norekiniem:", 330, y - 116, 9));
  lines.push(pdfTextCommand([iban, bankName, swift ? `SWIFT/BIC ${swift}` : ""].filter(Boolean).join(", "), 330, y - 132, 8, true));
  if (settings.showSignature) {
    lines.push(pdfTextCommand(`${settings.providerSignerTitle || "Parakstitajs"}: ${settings.providerSignerName || "-"}`, 48, y - 164, 9));
  }

  return buildPdf(lines);
}

function openGeneratedPdf(pdf: Blob, fileName: string) {
  const url = URL.createObjectURL(pdf);
  const opened = window.open(url, "_blank");
  if (opened) {
    opened.opener = null;
  } else {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function electricityReadingInfoFromApartment(item: RawRecord): ElectricityReadingInfo {
  const waterReadings = asRecord(item.waterReadings);
  const electricity = asRecord(waterReadings.electricitymeter);
  const history = Array.isArray(electricity.history) ? electricity.history : [];
  const sorted = history
    .map((entry) => asRecord(entry))
    .sort((left, right) => {
      const leftYear = numberValue(left.year);
      const rightYear = numberValue(right.year);
      if (leftYear !== rightYear) return rightYear - leftYear;
      const leftMonth = numberValue(left.month);
      const rightMonth = numberValue(right.month);
      if (leftMonth !== rightMonth) return rightMonth - leftMonth;
      return firstString(right.submittedAt).localeCompare(firstString(left.submittedAt));
    });
  const latest = sorted[0];
  if (!latest) {
    return {
      latestReadingId: "",
      meterId: firstString(electricity.meterId),
      meterDigits: numberValue(electricity.meterDigits) || undefined,
      previousValue: null,
      currentValue: null,
      consumption: 0,
      hasPrevious: false,
    };
  }

  const previousReading = sorted[1];
  const currentValue = numberValue(latest.currentValue);
  const previousValue = previousReading ? numberValue(previousReading.currentValue) : null;
  return {
    latestReadingId: firstString(latest.id),
    meterId: firstString(electricity.meterId, latest.meterId),
    meterDigits: numberValue(electricity.meterDigits) || undefined,
    previousValue,
    currentValue,
    consumption: previousValue === null ? 0 : Number(Math.max(0, currentValue - previousValue).toFixed(3)),
    hasPrevious: previousValue !== null,
  };
}

export function ElectricityWorkspace({
  role,
  companyId,
  company,
  buildings,
  apartments,
  invoices,
  initialSettingsOpen = false,
}: {
  role: DashboardRole;
  companyId?: string;
  company?: CompanyInvoiceProfile;
  buildings: Building[];
  apartments: RawRecord[];
  invoices: Invoice[];
  initialSettingsOpen?: boolean;
}) {
  const locale = useLocale();
  const copy = getCopy(locale);
  const notifications = useNotifications();
  const canManage = role === "managementCompany";
  const companyProfile = company ?? {};
  const invoiceSettings = normalizeInvoiceGenerationSettings(companyProfile.invoiceSettings);
  const actionsRef = useRef<HTMLDivElement>(null);

  const buildingOptions = useMemo(
    () => buildings
      .filter((building) => isElectricityEnabledBuilding(building))
      .map((building) => ({ id: building.id, label: building.name || building.address || building.id })),
    [buildings],
  );
  const [selectedBuildingId, setSelectedBuildingId] = useState(buildingOptions[0]?.id ?? "");
  const [buildingReadingConfigOverrides, setBuildingReadingConfigOverrides] = useState<
    Record<string, NonNullable<Building["readingConfig"]>>
  >({});
  const selectedBaseBuilding = useMemo(
    () => buildings.find((building) => building.id === selectedBuildingId),
    [buildings, selectedBuildingId],
  );
  const selectedBuilding = useMemo(() => {
    if (!selectedBaseBuilding) return undefined;
    const override = buildingReadingConfigOverrides[selectedBaseBuilding.id];
    if (!override) return selectedBaseBuilding;

    return {
      ...selectedBaseBuilding,
      readingConfig: {
        ...selectedBaseBuilding.readingConfig,
        ...override,
      },
    };
  }, [buildingReadingConfigOverrides, selectedBaseBuilding]);
  const electricityPricePerKwh = Math.max(0, selectedBuilding?.readingConfig?.electricityPricePerKwh ?? 0);

  const apartmentOptions = useMemo<ApartmentOption[]>(
    () =>
      apartments
        .map((item) => {
          const id = firstString(item.id, item.apartmentId, item.readableId);
          if (!id) return null;
          const number = firstString(item.number, item.apartmentNumber, item.label, id);
          const address = firstString(item.address, item.buildingName, item.buildingId);
          return {
            id,
            label: address ? `${number} - ${address}` : number,
            buildingId: firstString(item.buildingId),
          };
        })
        .filter((item): item is ApartmentOption => Boolean(item)),
    [apartments],
  );
  const filteredApartmentOptions = useMemo(
    () => selectedBuildingId
      ? apartmentOptions.filter((apartment) => !apartment.buildingId || apartment.buildingId === selectedBuildingId)
      : apartmentOptions,
    [apartmentOptions, selectedBuildingId],
  );
  const apartmentLabelById = useMemo(
    () => new Map(apartmentOptions.map((apartment) => [apartment.id, apartment.label])),
    [apartmentOptions],
  );
  const apartmentById = useMemo(
    () => new Map(
      apartments
        .map((item) => [firstString(item.id, item.apartmentId, item.readableId), item] as const)
        .filter(([id]) => Boolean(id)),
    ),
    [apartments],
  );
  const electricityReadingInfoByApartmentId = useMemo(
    () => new Map(
      Array.from(apartmentById.entries()).map(([id, item]) => [id, electricityReadingInfoFromApartment(item)] as const),
    ),
    [apartmentById],
  );

  const [payments, setPayments] = useState<ElectricityPayment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [confirmingPaymentId, setConfirmingPaymentId] = useState<string | null>(null);
  const [processingRecordId, setProcessingRecordId] = useState<string | null>(null);
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);
  const [deletedRecordIds, setDeletedRecordIds] = useState<string[]>([]);
  const [recordStatusOverrides, setRecordStatusOverrides] = useState<Record<string, string>>({});
  const [actionsOpen, setActionsOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(initialSettingsOpen);
  const [mode, setMode] = useState<"advance" | "consumption">("advance");
  const [apartmentId, setApartmentId] = useState("");
  const [kwh, setKwh] = useState("");
  const [currentActualValue, setCurrentActualValue] = useState("");
  const [nextActualValue, setNextActualValue] = useState("");
  const [paidAt, setPaidAt] = useState(todayInputValue());
  const [useCurrentAsStart, setUseCurrentAsStart] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createdRecords, setCreatedRecords] = useState<ElectricityRecord[]>([]);
  const [typeFilter, setTypeFilter] = useState<"all" | ElectricityRecordType>("all");
  const [apartmentFilter, setApartmentFilter] = useState("");
  const [periodMode, setPeriodMode] = useState<"month" | "range">("month");
  const [filterMonth, setFilterMonth] = useState(currentPeriodValue());
  const [filterFromMonth, setFilterFromMonth] = useState(currentPeriodValue());
  const [filterToMonth, setFilterToMonth] = useState(currentPeriodValue());
  const [settingsMeterDigits, setSettingsMeterDigits] = useState("6");
  const [settingsUserSetsDigits, setSettingsUserSetsDigits] = useState(false);
  const [settingsAllowMultipleMonthly, setSettingsAllowMultipleMonthly] = useState(false);
  const [settingsFixedPriceEnabled, setSettingsFixedPriceEnabled] = useState(false);
  const [settingsPricePerKwh, setSettingsPricePerKwh] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);

  const confirmedPayments = payments.filter((payment) => payment.confirmed);
  const selectedReadingInfo = electricityReadingInfoByApartmentId.get(apartmentId)
    ?? { latestReadingId: "", meterId: "", previousValue: null, currentValue: null, consumption: 0, hasPrevious: false };

  const records = useMemo<ElectricityRecord[]>(() => {
    const advanceRecords = payments.map((payment) => ({
      id: `advance-${payment.id}`,
      type: "advance" as const,
      apartmentId: payment.apartmentId,
      amount: payment.amount,
      kwh: payment.paidKwh,
      date: payment.paidAt,
      status: payment.confirmed ? copy.confirmed : copy.pending,
      confirmed: payment.confirmed,
      note: payment.note,
      payment,
    }));
    const invoiceRecords = invoices
      .filter((invoice) => {
        if (selectedBuildingId && invoice.buildingId && invoice.buildingId !== selectedBuildingId) return false;
        const marker = `${invoice.comment ?? ""} ${invoice.externalId ?? ""}`.toLowerCase();
        return marker.includes("electricity");
      })
      .map((invoice) => ({
        id: `invoice-${invoice.id}`,
        type: "invoice" as const,
        invoiceId: invoice.id,
        apartmentId: invoice.apartmentId ?? "",
        amount: moneyValue(invoice.amount),
        kwh: electricityInvoiceKwh(invoice),
        date: invoice.invoiceDate ?? invoice.dueDate ?? invoice.period ?? "",
        status: firstString(recordStatusOverrides[`invoice-${invoice.id}`], invoice.status, "pending"),
        confirmed: firstString(recordStatusOverrides[`invoice-${invoice.id}`], invoice.status, "pending").toLowerCase() !== "pending",
        note: invoice.comment ?? "",
      }));

    return [...createdRecords, ...advanceRecords, ...invoiceRecords]
      .filter((record) => !deletedRecordIds.includes(record.id))
      .map((record) => {
        const status = recordStatusOverrides[record.id];
        return status ? { ...record, status, confirmed: status.toLowerCase() !== "pending" } : record;
      })
      .sort((left, right) => firstString(right.date).localeCompare(firstString(left.date)));
  }, [copy.confirmed, copy.pending, createdRecords, deletedRecordIds, invoices, payments, recordStatusOverrides, selectedBuildingId]);

  const filteredRecords = records.filter((record) => {
    if (typeFilter !== "all" && record.type !== typeFilter) return false;
    if (apartmentFilter && record.apartmentId !== apartmentFilter) return false;

    const recordMonth = firstString(record.date).slice(0, 7);
    if (!recordMonth) return false;
    if (periodMode === "month") return recordMonth === filterMonth;

    const from = filterFromMonth || "0000-01";
    const to = filterToMonth || "9999-12";
    return recordMonth >= from && recordMonth <= to;
  });
  const filteredAdvanceRecords = filteredRecords.filter((record) => record.type === "advance");
  const pendingAmount = filteredAdvanceRecords
    .filter((record) => !record.confirmed)
    .reduce((sum, record) => sum + record.amount, 0);
  const confirmedAmount = filteredAdvanceRecords
    .filter((record) => record.confirmed)
    .reduce((sum, record) => sum + record.amount, 0);
  const selectedConfirmedAdvanceKwh = confirmedPayments
    .filter((payment) => payment.apartmentId === apartmentId)
    .reduce((sum, payment) => sum + payment.paidKwh, 0);
  const selectedUsedAdvanceKwh = records
    .filter((record) => record.type === "invoice" && record.apartmentId === apartmentId)
    .reduce((sum, record) => sum + electricityAdvanceUsedKwh(record.note), 0);
  const selectedAvailableAdvanceKwh = Number(Math.max(0, selectedConfirmedAdvanceKwh - selectedUsedAdvanceKwh).toFixed(3));
  const kwhValue = Math.max(0, numberValue(kwh));
  const billableKwhValue = mode === "consumption"
    ? Number(Math.max(0, kwhValue - selectedAvailableAdvanceKwh).toFixed(3))
    : kwhValue;
  const coveredByAdvanceKwhValue = mode === "consumption"
    ? Number(Math.min(kwhValue, selectedAvailableAdvanceKwh).toFixed(3))
    : 0;
  const coveredByAdvanceAmount = Number((coveredByAdvanceKwhValue * electricityPricePerKwh).toFixed(2));
  const amount = Number((billableKwhValue * electricityPricePerKwh).toFixed(2));
  const electricitySetupItems = useMemo(
    () => {
      const mergedBuildings = buildings.map((building) => {
        const override = buildingReadingConfigOverrides[building.id];
        return override
          ? { ...building, readingConfig: { ...building.readingConfig, ...override } }
          : building;
      });

      return mergedBuildings
        .map((building) => electricitySetupNotificationFromBuilding(building))
        .filter((item): item is NotificationItem => Boolean(item));
    },
    [buildingReadingConfigOverrides, buildings],
  );

  useEffect(() => {
    const detail = {
      electricityEnabled: buildingOptions.length > 0,
      electricitySetupItems,
    };
    notifyBuildingsChanged(detail);

    const timeoutId = window.setTimeout(() => notifyBuildingsChanged(detail), 0);
    return () => window.clearTimeout(timeoutId);
  }, [buildingOptions.length, electricitySetupItems]);

  useEffect(() => {
    if (!selectedBuildingId && buildingOptions[0]?.id) {
      setSelectedBuildingId(buildingOptions[0].id);
      return;
    }
    if (selectedBuildingId && !buildingOptions.some((building) => building.id === selectedBuildingId)) {
      setSelectedBuildingId(buildingOptions[0]?.id ?? "");
    }
  }, [buildingOptions, selectedBuildingId]);

  useEffect(() => {
    if (initialSettingsOpen) {
      setSettingsOpen(true);
    }
  }, [initialSettingsOpen]);

  useEffect(() => {
    if (!selectedBuilding?.readingConfig) return;

    setSettingsMeterDigits(String(electricityDigitsValue(selectedBuilding.readingConfig.electricityMeterDigits)));
    setSettingsUserSetsDigits(Boolean(selectedBuilding.readingConfig.electricityUserSetsDigits));
    setSettingsAllowMultipleMonthly(Boolean(selectedBuilding.readingConfig.electricityAllowMultipleMonthlySubmissions));
    setSettingsFixedPriceEnabled(Boolean(selectedBuilding.readingConfig.electricityFixedPriceEnabled));
    setSettingsPricePerKwh(
      selectedBuilding.readingConfig.electricityPricePerKwh
        ? String(selectedBuilding.readingConfig.electricityPricePerKwh)
        : "",
    );
  }, [selectedBuilding]);

  useEffect(() => {
    if (!canManage || !selectedBuildingId) {
      setPayments([]);
      return;
    }

    let cancelled = false;
    setPaymentsLoading(true);
    apiFetch<{ items?: RawRecord[] }>(`/meter-readings/electricity-payments?buildingId=${encodeURIComponent(selectedBuildingId)}`)
      .then((response) => {
        if (cancelled) return;
        setPayments((response.items ?? [])
          .map((item) => ({
            id: firstString(item.id),
            apartmentId: firstString(item.apartmentId),
            amount: Math.max(0, numberValue(item.amount)),
            paidKwh: Math.max(0, numberValue(item.paidKwh)),
            paidAt: firstString(item.paidAt),
            note: firstString(item.note),
            confirmed: item.confirmed !== false,
          }))
          .filter((item) => item.id && item.apartmentId));
      })
      .catch(() => {
        if (!cancelled) setPayments([]);
      })
      .finally(() => {
        if (!cancelled) setPaymentsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canManage, selectedBuildingId]);

  useEffect(() => {
    if (apartmentFilter && !filteredApartmentOptions.some((apartment) => apartment.id === apartmentFilter)) {
      setApartmentFilter("");
    }
  }, [apartmentFilter, filteredApartmentOptions]);

  useEffect(() => {
    if (!actionsOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (actionsRef.current && !actionsRef.current.contains(event.target as Node)) {
        setActionsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [actionsOpen]);

  useEffect(() => {
    if (!modalOpen && !settingsOpen) return;

    const scrollY = window.scrollY;
    const previousPosition = document.body.style.position;
    const previousTop = document.body.style.top;
    const previousWidth = document.body.style.width;
    const previousOverflow = document.body.style.overflow;

    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.position = previousPosition;
      document.body.style.top = previousTop;
      document.body.style.width = previousWidth;
      document.body.style.overflow = previousOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [modalOpen, settingsOpen]);

  function consumptionForActualValue(targetApartmentId: string, currentValue: number, startMode: boolean) {
    if (startMode) return consumptionFromStartValue(currentValue, numberValue(nextActualValue));
    const readingInfo = electricityReadingInfoByApartmentId.get(targetApartmentId);
    return Number(Math.max(0, currentValue - (readingInfo?.previousValue ?? 0)).toFixed(3));
  }

  function consumptionFromStartValue(startValue: number, nextValue: number) {
    return Number(Math.max(0, nextValue - startValue).toFixed(3));
  }

  function payableConsumptionKwh(targetApartmentId: string) {
    const readingInfo = electricityReadingInfoByApartmentId.get(targetApartmentId);
    const consumed = readingInfo?.consumption ?? 0;
    const paid = confirmedPayments
      .filter((payment) => payment.apartmentId === targetApartmentId)
      .reduce((sum, payment) => sum + payment.paidKwh, 0);
    return Number(Math.max(0, consumed - paid).toFixed(3));
  }

  function validateElectricityAction(nextMode: "advance" | "consumption") {
    if (!selectedBuilding) {
      notifications.warning(copy.noEnabledBuildings);
      return false;
    }

    if (filteredApartmentOptions.length === 0) {
      notifications.warning(copy.noApartments);
      return false;
    }

    if (electricityPricePerKwh <= 0) {
      notifications.warning(copy.tariffMissing);
      window.setTimeout(() => setSettingsOpen(true), 120);
      return false;
    }

    if (nextMode === "consumption") {
      const rawDigits = selectedBuilding.readingConfig?.electricityMeterDigits;
      const residentCanChooseDigits = Boolean(selectedBuilding.readingConfig?.electricityUserSetsDigits);
      const buildingDigitsValid = typeof rawDigits === "number" && rawDigits >= 5 && rawDigits <= 7;

      if (!residentCanChooseDigits && !buildingDigitsValid) {
        notifications.warning(copy.meterDigitsMissing);
        window.setTimeout(() => setSettingsOpen(true), 120);
        return false;
      }
    }

    return true;
  }

  function handleOpenPaymentModal(nextMode: "advance" | "consumption") {
    setActionsOpen(false);
    if (!validateElectricityAction(nextMode)) return;
    openPaymentModal(nextMode);
  }

  function openPaymentModal(nextMode: "advance" | "consumption") {
    const targetApartment = nextMode === "consumption"
      ? filteredApartmentOptions.find((apartment) => payableConsumptionKwh(apartment.id) > 0) ?? filteredApartmentOptions[0]
      : filteredApartmentOptions[0];
    const targetApartmentId = targetApartment?.id ?? "";
    const targetInfo = electricityReadingInfoByApartmentId.get(targetApartmentId);
    const startMode = nextMode === "consumption" && !targetInfo?.hasPrevious;
    const currentValue = targetInfo?.currentValue ?? 0;
    setMode(nextMode);
    setApartmentId(targetApartmentId);
    setUseCurrentAsStart(startMode);
    setCurrentActualValue(targetInfo?.currentValue != null ? String(targetInfo.currentValue) : "");
    setNextActualValue("");
    setKwh(nextMode === "consumption" && targetApartmentId
      ? String(startMode ? 0 : consumptionForActualValue(targetApartmentId, currentValue, false))
      : "");
    setPaidAt(todayInputValue());
    setModalOpen(true);
  }

  async function handleSaveElectricitySettings() {
    if (!selectedBuilding) return;

    const meterDigits = electricityDigitsValue(settingsMeterDigits);
    const pricePerKwh = numberValue(settingsPricePerKwh);

    if (meterDigits < 5 || meterDigits > 7) {
      notifications.warning(copy.invalidDigits);
      return;
    }

    if (settingsFixedPriceEnabled && pricePerKwh <= 0) {
      notifications.warning(copy.invalidPrice);
      return;
    }

    const currentConfig = selectedBuilding.readingConfig;
    const nextReadingConfig: NonNullable<Building["readingConfig"]> = {
      ...currentConfig,
      waterEnabled: Boolean(currentConfig?.waterEnabled),
      electricityEnabled: true,
      heatingEnabled: Boolean(currentConfig?.heatingEnabled),
      hotWaterMetersPerResident: Math.max(0, Math.floor(numberValue(currentConfig?.hotWaterMetersPerResident))),
      coldWaterMetersPerResident: Math.max(0, Math.floor(numberValue(currentConfig?.coldWaterMetersPerResident))),
      electricityMeterDigits: meterDigits,
      electricityUserSetsDigits: settingsUserSetsDigits,
      electricityAllowMultipleMonthlySubmissions: settingsAllowMultipleMonthly,
      electricityFixedPriceEnabled: settingsFixedPriceEnabled,
      electricityPricePerKwh: settingsFixedPriceEnabled ? pricePerKwh : 0,
    };

    setSettingsSaving(true);
    try {
      const payload: Parameters<typeof updateBuilding>[1] = {
        name: selectedBuilding.name,
        address: selectedBuilding.address,
        comment: selectedBuilding.comment ?? "",
        apartmentsCount: selectedBuilding.apartments,
        readingConfig: nextReadingConfig,
      };
      if (selectedBuilding.subscriptionTermYears != null) {
        payload.subscriptionTermYears = selectedBuilding.subscriptionTermYears;
      }
      if (selectedBuilding.subscriptionTermMonths != null) {
        payload.subscriptionTermMonths = selectedBuilding.subscriptionTermMonths;
      }

      await updateBuilding(selectedBuilding.id, payload);
      setBuildingReadingConfigOverrides((items) => ({
        ...items,
        [selectedBuilding.id]: nextReadingConfig,
      }));
      setSettingsOpen(false);
      notifications.success(copy.settingsSaved);
    } catch (error) {
      console.error(error);
      notifications.error(copy.settingsSaveFailed);
    } finally {
      setSettingsSaving(false);
    }
  }

  function handleApartmentChange(nextApartmentId: string) {
    setApartmentId(nextApartmentId);
    if (mode !== "consumption") return;
    const readingInfo = electricityReadingInfoByApartmentId.get(nextApartmentId);
    const startMode = !readingInfo?.hasPrevious;
    const currentValue = readingInfo?.currentValue ?? 0;
    setUseCurrentAsStart(startMode);
    setCurrentActualValue(readingInfo?.currentValue != null ? String(readingInfo.currentValue) : "");
    setNextActualValue("");
    setKwh(nextApartmentId ? String(startMode ? 0 : consumptionForActualValue(nextApartmentId, currentValue, false)) : "");
  }

  function handleCurrentActualChange(value: string) {
    setCurrentActualValue(value);
    if (mode !== "consumption") return;
    setKwh(useCurrentAsStart
      ? String(consumptionFromStartValue(numberValue(value), numberValue(nextActualValue)))
      : String(consumptionForActualValue(apartmentId, numberValue(value), false)));
  }

  function handleNextActualChange(value: string) {
    setNextActualValue(value);
    if (mode !== "consumption" || !useCurrentAsStart) return;
    setKwh(String(consumptionFromStartValue(numberValue(currentActualValue), numberValue(value))));
  }

  async function saveStartReading() {
    const currentValue = numberValue(currentActualValue);
    if (currentValue <= 0) {
      notifications.warning(copy.currentRequired);
      return false;
    }

    const now = new Date();
    const period = currentPeriodValue();
    const [yearRaw, monthRaw] = period.split("-");
    const year = Number(yearRaw) || now.getFullYear();
    const month = Number(monthRaw) || now.getMonth() + 1;

    if (selectedReadingInfo.latestReadingId) {
      await apiFetch(`/meter-readings/${encodeURIComponent(selectedReadingInfo.latestReadingId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          apartmentId,
          data: { currentValue, previousValue: null, consumption: 0, month, year },
        }),
        headers: { "Content-Type": "application/json" },
      });
    } else {
      const meterId = selectedReadingInfo.meterId || `${apartmentId}:electricitymeter`;
      await apiFetch("/meter-readings", {
        method: "POST",
        body: JSON.stringify({
          apartmentId,
          buildingId: selectedBuildingId,
          meterId,
          meterKey: "electricitymeter",
          currentValue,
          previousValue: currentValue,
          meterDigits: selectedReadingInfo.meterDigits ?? selectedBuilding?.readingConfig?.electricityMeterDigits ?? 6,
          month,
          year,
        }),
        headers: { "Content-Type": "application/json" },
      });
    }

    return true;
  }

  async function saveNextReading(previousValue: number, currentValue: number) {
    const now = new Date();
    const period = currentPeriodValue();
    const [yearRaw, monthRaw] = period.split("-");
    const year = Number(yearRaw) || now.getFullYear();
    const month = Number(monthRaw) || now.getMonth() + 1;
    const meterId = selectedReadingInfo.meterId || `${apartmentId}:electricitymeter`;

    if (selectedReadingInfo.latestReadingId) {
      await apiFetch(`/meter-readings/${encodeURIComponent(selectedReadingInfo.latestReadingId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          apartmentId,
          data: {
            currentValue,
            previousValue,
            consumption: Number(Math.max(0, currentValue - previousValue).toFixed(3)),
            month,
            year,
          },
        }),
        headers: { "Content-Type": "application/json" },
      });
      return;
    }

    await apiFetch("/meter-readings", {
      method: "POST",
      body: JSON.stringify({
        apartmentId,
        buildingId: selectedBuildingId,
        meterId,
        meterKey: "electricitymeter",
        currentValue,
        previousValue,
        meterDigits: selectedReadingInfo.meterDigits ?? selectedBuilding?.readingConfig?.electricityMeterDigits ?? 6,
        month,
        year,
      }),
      headers: { "Content-Type": "application/json" },
    });
  }

  async function handleConfirmPayment(payment: ElectricityPayment) {
    setConfirmingPaymentId(payment.id);
    try {
      await apiFetch(`/meter-readings/electricity-payments/${encodeURIComponent(payment.id)}/confirm`, {
        method: "PATCH",
        body: JSON.stringify({ apartmentId: payment.apartmentId }),
        headers: { "Content-Type": "application/json" },
      });
      setPayments((items) => items.map((item) => (item.id === payment.id ? { ...item, confirmed: true } : item)));
      notifications.success(copy.confirmedToast);
    } catch (error) {
      console.error(error);
      notifications.error(copy.confirmFailed);
    } finally {
      setConfirmingPaymentId(null);
    }
  }

  async function handleAcceptRecord(record: ElectricityRecord) {
    if (record.type === "advance" && record.payment) {
      await handleConfirmPayment(record.payment);
      return;
    }

    setProcessingRecordId(record.id);
    try {
      if (record.approvalId) {
        await apiFetch<{ success?: boolean; invoice_id?: string }>(
          `/invoices/pending-approvals/${encodeURIComponent(record.approvalId)}/approve`,
          { method: "POST" },
        );
      } else {
        const invoiceId = record.invoiceId || record.id.replace(/^invoice-/, "");
        await apiFetch(`/invoices/${encodeURIComponent(invoiceId)}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "paid" }),
          headers: { "Content-Type": "application/json" },
        });
      }

      setRecordStatusOverrides((items) => ({ ...items, [record.id]: "paid" }));
      setCreatedRecords((items) => items.map((item) => (
        item.id === record.id ? { ...item, status: "paid", confirmed: true } : item
      )));
      notifications.success(copy.confirmedToast);
    } catch (error) {
      console.error(error);
      notifications.error(copy.confirmFailed);
    } finally {
      setProcessingRecordId(null);
    }
  }

  async function handleDeleteRecord(record: ElectricityRecord) {
    setDeletingRecordId(record.id);
    try {
      if (record.type === "advance" && record.payment) {
        await apiFetch(`/meter-readings/electricity-payments/${encodeURIComponent(record.payment.id)}?apartmentId=${encodeURIComponent(record.payment.apartmentId)}`, {
          method: "DELETE",
        });
        setPayments((items) => items.filter((item) => item.id !== record.payment?.id));
      } else {
        if (record.approvalId) {
          await apiFetch(`/invoices/pending-approvals/${encodeURIComponent(record.approvalId)}`, {
            method: "DELETE",
          });
        } else {
          const invoiceId = record.invoiceId || record.id.replace(/^invoice-/, "");
          await apiFetch(`/invoices/${encodeURIComponent(invoiceId)}`, {
            method: "DELETE",
          });
        }
      }

      setDeletedRecordIds((items) => [...items, record.id]);
      setCreatedRecords((items) => items.filter((item) => item.id !== record.id));
      notifications.success("Record deleted.");
    } catch (error) {
      console.error(error);
      notifications.error("Could not delete record.");
    } finally {
      setDeletingRecordId(null);
    }
  }

  async function handleSubmitPayment() {
    if (!apartmentId) {
      notifications.warning(copy.apartmentRequired);
      return;
    }
    if (mode === "consumption" && useCurrentAsStart) {
      setSaving(true);
      try {
        if (kwhValue <= 0) {
          const saved = await saveStartReading();
          if (!saved) {
            setSaving(false);
            return;
          }
          setSaving(false);
          setModalOpen(false);
          notifications.success(copy.startSaved);
          return;
        }
        await saveNextReading(numberValue(currentActualValue), numberValue(nextActualValue));
      } catch (error) {
        console.error(error);
        notifications.error(copy.invoiceCreateFailed);
        setSaving(false);
        return;
      }
    }
    if (kwhValue <= 0) {
      notifications.warning(copy.kwhRequired);
      return;
    }
    if (electricityPricePerKwh <= 0) {
      notifications.warning(copy.tariffMissing);
      return;
    }

    setSaving(true);
    try {
      if (mode === "consumption") {
        const period = currentPeriodValue();
        const apartmentLabel = apartmentLabelById.get(apartmentId) ?? "";
        const apartmentNumber = apartmentLabel.split(" - ")[0] ?? "";
        const invoiceNumber = buildConfiguredInvoiceNumber({
          settings: invoiceSettings,
          company: companyProfile,
          apartmentNumber,
          invoiceDate: paidAt,
          sequence: invoices.length + createdRecords.length + 1,
        });
        const externalId = `electricity-${invoiceNumber}-${apartmentId}-${period}`;
        const comment = `Electricity ${billableKwhValue.toFixed(3)} kWh (consumption ${kwhValue.toFixed(3)} kWh, advance ${Math.min(kwhValue, selectedAvailableAdvanceKwh).toFixed(3)} kWh)`;
        const pdf = buildElectricityInvoicePdf({
          invoiceNumber,
          settings: invoiceSettings,
          company: companyProfile,
          buildingAddress: selectedBuilding?.address ?? "",
          apartmentLabel: apartmentLabel || apartmentNumber,
          invoiceDate: paidAt,
          period,
          tariff: electricityPricePerKwh,
          consumptionKwh: kwhValue,
          advanceKwh: coveredByAdvanceKwhValue,
          advanceAmount: coveredByAdvanceAmount,
          billableKwh: billableKwhValue,
          amount,
        });
        const fileName = `${externalId}.pdf`;
        const response = await uploadInvoice({
          file: pdf,
          fileName,
          buildingId: selectedBuildingId,
          apartmentId,
          companyId,
          period,
          invoiceDate: paidAt,
          amount,
          currency: invoiceSettings.currency,
          externalId,
          status: "pending",
          comment,
          source: "manual",
        });
        openGeneratedPdf(pdf, fileName);
        setCreatedRecords((items) => [{
          id: `invoice-${firstString(response.invoice_id, response.approval_id, Date.now())}`,
          type: "invoice",
          invoiceId: firstString(response.invoice_id),
          approvalId: firstString(response.approval_id),
          apartmentId,
          amount,
          kwh: billableKwhValue,
          date: paidAt,
          status: "pending",
          confirmed: false,
          note: comment,
        }, ...items]);
        setModalOpen(false);
        notifications.success(copy.invoiceCreated);
        return;
      }

      const response = await apiFetch<{ payment?: RawRecord }>("/meter-readings/electricity-payments", {
        method: "POST",
        body: JSON.stringify({ apartmentId, amount, paidKwh: kwhValue, paidAt, note: "" }),
        headers: { "Content-Type": "application/json" },
      });
      const payment = response.payment ?? {};
      setPayments((items) => [{
        id: firstString(payment.id),
        apartmentId: firstString(payment.apartmentId, apartmentId),
        amount: Math.max(0, numberValue(payment.amount) || amount),
        paidKwh: Math.max(0, numberValue(payment.paidKwh) || kwhValue),
        paidAt: firstString(payment.paidAt, paidAt),
        note: firstString(payment.note),
        confirmed: payment.confirmed !== false,
      }, ...items]);
      setModalOpen(false);
      notifications.success(copy.advanceCreated);
    } catch (error) {
      console.error(error);
      notifications.error(mode === "consumption" ? copy.invoiceCreateFailed : copy.advanceCreateFailed);
    } finally {
      setSaving(false);
    }
  }

  if (!canManage) {
    return null;
  }

  return (
    <div className="space-y-6">
      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex touch-none items-stretch justify-center overflow-hidden bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-3" onClick={() => setModalOpen(false)}>
          <div
            className="flex h-[100dvh] max-h-[100dvh] w-full max-w-3xl flex-col overflow-hidden border border-slate-200 bg-white shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-1.5rem)] sm:rounded-2xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-base font-semibold text-slate-950">
                  {mode === "consumption" ? copy.consumptionTitle : copy.advanceTitle}
                </h2>
                <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                  {mode === "consumption" ? copy.consumptionDescription : copy.advanceDescription}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                aria-label={copy.close}
              >
                <FiX className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="overscroll-contain overflow-y-auto p-4 touch-pan-y">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-slate-700">{copy.apartment}</span>
                <select
                  value={apartmentId}
                  onChange={(event) => handleApartmentChange(event.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">{copy.chooseApartment}</option>
                  {filteredApartmentOptions.map((apartment) => (
                    <option key={apartment.id} value={apartment.id}>{apartment.label}</option>
                  ))}
                </select>
              </label>

              <div className="mt-4 grid gap-4 md:grid-cols-[1fr_240px]">
                <div className="space-y-3">
                  {mode === "consumption" ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <div className={`grid items-end gap-2 ${useCurrentAsStart ? "sm:grid-cols-[1fr_auto_1fr_auto_1fr]" : "sm:grid-cols-[1fr_auto_1fr]"}`}>
                        <div>
                          <p className="text-[11px] font-semibold uppercase text-slate-500">{copy.previousReading}</p>
                          <p className="mt-1 h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-base font-bold text-slate-900">
                            {selectedReadingInfo.previousValue === null ? "-" : selectedReadingInfo.previousValue}
                          </p>
                        </div>
                        <div className="hidden pb-2 text-xs font-semibold text-slate-400 sm:block">-&gt;</div>
                        <label>
                          <span className="text-[11px] font-semibold uppercase text-slate-500">{copy.currentReading}</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={currentActualValue}
                            onChange={(event) => handleCurrentActualChange(event.target.value)}
                            readOnly={useCurrentAsStart && selectedReadingInfo.currentValue !== null}
                            className={`mt-1 h-10 w-full rounded-lg border px-3 text-base font-bold outline-none ${
                              useCurrentAsStart && selectedReadingInfo.currentValue !== null
                                ? "border-slate-200 bg-slate-100 text-slate-700"
                                : "border-amber-200 bg-white text-slate-900 focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                            }`}
                          />
                        </label>
                        {useCurrentAsStart ? <div className="hidden pb-2 text-xs font-semibold text-slate-400 sm:block">-&gt;</div> : null}
                        {useCurrentAsStart ? (
                          <label>
                            <span className="text-[11px] font-semibold uppercase text-slate-500">{copy.nextReading}</span>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={nextActualValue}
                              onChange={(event) => handleNextActualChange(event.target.value)}
                              className="mt-1 h-10 w-full rounded-lg border border-amber-200 bg-white px-3 text-base font-bold text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                            />
                          </label>
                        ) : null}
                      </div>
                </div>
              ) : null}

                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="flex flex-col gap-1.5 text-sm">
                      <span className="font-medium text-slate-700">{copy.kwh}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={kwh}
                        onChange={(event) => setKwh(event.target.value)}
                        readOnly={mode === "consumption"}
                        className="h-10 rounded-xl border border-amber-200 px-3 text-sm font-semibold text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm">
                      <span className="font-medium text-slate-700">{copy.paymentDate}</span>
                      <input
                        type="date"
                        value={paidAt}
                        onChange={(event) => setPaidAt(event.target.value)}
                        className="h-10 rounded-xl border border-slate-200 px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>
                  </div>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-[11px] font-semibold uppercase text-slate-500">{copy.tariff}</p>
                      <p className="text-sm font-bold text-slate-900">{formatMoney(electricityPricePerKwh)} / kWh</p>
                    </div>
                    {mode === "consumption" ? (
                      <>
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="text-[11px] font-semibold uppercase text-slate-500">{copy.availableAdvance}</p>
                          <p className="text-sm font-bold text-emerald-700">{selectedAvailableAdvanceKwh.toFixed(3)} kWh</p>
                        </div>
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5">
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="text-[11px] font-semibold uppercase text-emerald-700">{copy.coveredByAdvance}</p>
                            <p className="text-sm font-bold text-emerald-700">{coveredByAdvanceKwhValue.toFixed(3)} kWh</p>
                          </div>
                          <p className="mt-0.5 text-right text-xs font-semibold text-emerald-700">{formatMoney(coveredByAdvanceAmount)}</p>
                        </div>
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="text-[11px] font-semibold uppercase text-slate-500">{copy.billableKwh}</p>
                          <p className="text-sm font-bold text-slate-900">{billableKwhValue.toFixed(3)} kWh</p>
                        </div>
                      </>
                    ) : null}
                    <div className="border-t border-amber-200 pt-2">
                      <p className="text-[11px] font-semibold uppercase text-slate-500">{copy.calculatedAmount}</p>
                      <p className="mt-0.5 text-xl font-bold text-amber-700">{formatMoney(amount)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
              <Button type="button" variant="secondary" size="sm" onClick={() => setModalOpen(false)} disabled={saving}>
                {copy.close}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void handleSubmitPayment()}
                disabled={saving || (kwhValue <= 0 && !(mode === "consumption" && useCurrentAsStart))}
              >
                {saving
                  ? copy.saving
                  : mode === "consumption" && useCurrentAsStart && kwhValue <= 0
                    ? copy.saveStart
                    : mode === "consumption"
                      ? copy.issueInvoice
                      : copy.acceptAdvance}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {settingsOpen ? (
        <div className="fixed inset-0 z-50 flex touch-none items-center justify-center overflow-hidden bg-slate-950/55 p-3 backdrop-blur-sm" onClick={() => setSettingsOpen(false)}>
          <div
            className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">{copy.settingsTitle}</h2>
                <p className="mt-1 text-sm text-slate-500">{selectedBuilding?.name || selectedBuilding?.address || copy.building}</p>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                aria-label={copy.close}
              >
                <FiX className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="bg-slate-50/60 p-5">
              <div className="overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm shadow-amber-950/5">
                <label className="grid gap-3 border-b border-amber-100 px-4 py-4 text-sm sm:grid-cols-[minmax(0,1fr)_16rem] sm:items-center">
                  <span className="font-semibold text-slate-700">{copy.meterDigits}</span>
                  <select
                    value={settingsMeterDigits}
                    onChange={(event) => setSettingsMeterDigits(event.target.value)}
                    className="h-11 w-full rounded-lg border border-amber-200 bg-amber-50/30 px-3 text-base font-semibold text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                  >
                    <option value="5">5</option>
                    <option value="6">6</option>
                    <option value="7">7</option>
                  </select>
                </label>

                <label className="grid gap-3 border-b border-amber-100 px-4 py-4 text-sm sm:grid-cols-[minmax(0,1fr)_16rem] sm:items-center">
                  <span className="font-semibold text-slate-700">{copy.userSetsDigits}</span>
                  <input
                    type="checkbox"
                    checked={settingsUserSetsDigits}
                    onChange={(event) => setSettingsUserSetsDigits(event.target.checked)}
                    className="h-5 w-5 rounded border-amber-300 text-amber-500 focus:ring-amber-300 sm:justify-self-start"
                  />
                </label>

                <label className="grid gap-3 border-b border-amber-100 px-4 py-4 text-sm sm:grid-cols-[minmax(0,1fr)_16rem] sm:items-center">
                  <span className="font-semibold text-slate-700">{copy.allowMultipleMonthly}</span>
                  <input
                    type="checkbox"
                    checked={settingsAllowMultipleMonthly}
                    onChange={(event) => setSettingsAllowMultipleMonthly(event.target.checked)}
                    className="h-5 w-5 rounded border-amber-300 text-amber-500 focus:ring-amber-300 sm:justify-self-start"
                  />
                </label>

                <label className="grid gap-3 border-b border-amber-100 px-4 py-4 text-sm sm:grid-cols-[minmax(0,1fr)_16rem] sm:items-center">
                  <span className="font-semibold text-slate-700">{copy.fixedPrice}</span>
                  <input
                    type="checkbox"
                    checked={settingsFixedPriceEnabled}
                    onChange={(event) => setSettingsFixedPriceEnabled(event.target.checked)}
                    className="h-5 w-5 rounded border-amber-300 text-amber-500 focus:ring-amber-300 sm:justify-self-start"
                  />
                </label>

                <label className="grid gap-3 px-4 py-4 text-sm sm:grid-cols-[minmax(0,1fr)_16rem] sm:items-center">
                  <span className="font-semibold text-slate-700">{copy.pricePerKwh}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={settingsPricePerKwh}
                    onChange={(event) => setSettingsPricePerKwh(event.target.value)}
                    disabled={!settingsFixedPriceEnabled}
                    className="h-11 w-full rounded-lg border border-amber-200 bg-amber-50/30 px-3 text-base font-semibold text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <Button type="button" variant="secondary" onClick={() => setSettingsOpen(false)} disabled={settingsSaving}>
                {copy.close}
              </Button>
              <Button
                type="button"
                onClick={() => void handleSaveElectricitySettings()}
                disabled={settingsSaving || !selectedBuilding}
              >
                {settingsSaving ? copy.saving : copy.saveSettings}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {buildingOptions.length === 0 ? (
        <SectionCard title={copy.title} description={copy.description}>
          <div className="rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-500">{copy.noEnabledBuildings}</div>
        </SectionCard>
      ) : (
        <SectionCard
          title={copy.title}
          description={copy.description}
          headerAside={
            <div className="flex flex-wrap items-center justify-end gap-2">
              {electricityPricePerKwh > 0 ? (
                <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-700">
                  {copy.tariff}: {formatMoney(electricityPricePerKwh)} / kWh
                </div>
              ) : null}
              <div className="relative" ref={actionsRef}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setActionsOpen((value) => !value)}
                >
                  {copy.actions}
                  <FiChevronDown className={`h-4 w-4 transition ${actionsOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                </Button>

                {actionsOpen ? (
                  <div className="absolute right-0 top-full z-30 mt-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10">
                    <button
                      type="button"
                      onClick={() => {
                        setActionsOpen(false);
                        setSettingsOpen(true);
                      }}
                      disabled={!selectedBuilding}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50"
                    >
                      <FiSettings className="h-4 w-4 text-blue-600" aria-hidden="true" />
                      <span>{copy.settingsTitle}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleOpenPaymentModal("consumption");
                      }}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <FiCheckCircle className="h-4 w-4 text-blue-600" aria-hidden="true" />
                      <span>{copy.issueInvoice}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleOpenPaymentModal("advance");
                      }}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <FiCheckCircle className="h-4 w-4 text-blue-600" aria-hidden="true" />
                      <span>{copy.acceptAdvance}</span>
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          }
        >
          <div className="mb-5 grid gap-3 border-b border-slate-100 pb-5 md:grid-cols-2 xl:grid-cols-5">
            <label className="flex min-w-0 flex-col gap-1.5 text-sm">
              <span className="font-medium text-slate-700">{copy.building}</span>
              <select
                value={selectedBuildingId}
                onChange={(event) => setSelectedBuildingId(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                {buildingOptions.map((building) => (
                  <option key={building.id} value={building.id}>{building.label}</option>
                ))}
              </select>
            </label>

            <label className="flex min-w-0 flex-col gap-1.5 text-sm">
              <span className="font-medium text-slate-700">{copy.type}</span>
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as "all" | ElectricityRecordType)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="all">{copy.allTypes}</option>
                <option value="advance">{copy.advanceType}</option>
                <option value="invoice">{copy.invoiceType}</option>
              </select>
            </label>

            <label className="flex min-w-0 flex-col gap-1.5 text-sm">
              <span className="font-medium text-slate-700">{copy.apartment}</span>
              <select
                value={apartmentFilter}
                onChange={(event) => setApartmentFilter(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">{copy.allApartments}</option>
                {filteredApartmentOptions.map((apartment) => (
                  <option key={apartment.id} value={apartment.id}>{apartment.label}</option>
                ))}
              </select>
            </label>

            <label className="flex min-w-0 flex-col gap-1.5 text-sm">
              <span className="font-medium text-slate-700">{copy.period}</span>
              <select
                value={periodMode}
                onChange={(event) => setPeriodMode(event.target.value as "month" | "range")}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="month">{copy.currentMonth}</option>
                <option value="range">{copy.customPeriod}</option>
              </select>
            </label>

            {periodMode === "month" ? (
              <label className="flex min-w-0 flex-col gap-1.5 text-sm">
                <span className="font-medium text-slate-700">{copy.currentMonth}</span>
                <input
                  type="month"
                  value={filterMonth}
                  onChange={(event) => setFilterMonth(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:col-span-1">
                <label className="flex min-w-0 flex-col gap-1.5 text-sm">
                  <span className="font-medium text-slate-700">{copy.fromMonth}</span>
                  <input
                    type="month"
                    value={filterFromMonth}
                    onChange={(event) => setFilterFromMonth(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-1.5 text-sm">
                  <span className="font-medium text-slate-700">{copy.toMonth}</span>
                  <input
                    type="month"
                    value={filterToMonth}
                    onChange={(event) => setFilterToMonth(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
              </div>
            )}
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{copy.pending}</p>
              <p className="mt-1 text-xl font-bold text-slate-950">{formatMoney(pendingAmount)}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{copy.confirmed}</p>
              <p className="mt-1 text-xl font-bold text-slate-950">{formatMoney(confirmedAmount)}</p>
            </div>
          </div>

          {paymentsLoading ? (
            <div className="rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-500">{copy.loading}</div>
          ) : filteredRecords.length ? (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">{copy.type}</th>
                      <th className="px-4 py-3 font-medium">{copy.apartment}</th>
                      <th className="px-4 py-3 font-medium">{copy.kwh}</th>
                      <th className="px-4 py-3 font-medium">{copy.amount}</th>
                      <th className="px-4 py-3 font-medium">{copy.paymentDate}</th>
                      <th className="px-4 py-3 font-medium">{copy.status}</th>
                      <th className="px-4 py-3 text-right font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredRecords.map((record) => {
                      const accepting = processingRecordId === record.id || (record.payment ? confirmingPaymentId === record.payment.id : false);
                      const deleting = deletingRecordId === record.id;

                      return (
                      <tr key={record.id}>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                            record.type === "advance" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"
                          }`}>
                            {record.type === "advance" ? copy.advanceType : copy.invoiceType}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {apartmentLabelById.get(record.apartmentId) || record.apartmentId || "-"}
                          {record.note ? <p className="mt-0.5 text-xs font-normal text-slate-500">{record.note}</p> : null}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-slate-700">{record.kwh.toFixed(3)}</td>
                        <td className="px-4 py-3 tabular-nums font-semibold text-slate-900">{formatMoney(record.amount)}</td>
                        <td className="px-4 py-3 tabular-nums text-slate-600">{formatDate(record.date)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                            record.confirmed ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                          }`}>
                            {record.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                          {!record.confirmed ? (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => void handleAcceptRecord(record)}
                              disabled={accepting || deleting}
                            >
                              <FiCheckCircle className="h-4 w-4" aria-hidden="true" />
                              {accepting ? copy.confirming : copy.confirm}
                            </Button>
                          ) : null}
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => void handleDeleteRecord(record)}
                              disabled={accepting || deleting}
                              title="Delete"
                            >
                              <FiTrash2 className="h-4 w-4" aria-hidden="true" />
                              {deleting ? "Deleting..." : "Delete"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-500">{copy.noRecords}</div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
