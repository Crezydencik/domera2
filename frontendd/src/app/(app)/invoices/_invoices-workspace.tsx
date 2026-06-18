"use client";

import { useLocale } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { FiAlertCircle, FiCheckCircle, FiEye, FiFileText, FiRefreshCw, FiTrash2, FiUploadCloud, FiX } from "react-icons/fi";
import { DataTable } from "@/components/data-table";
import { InvoiceDeleteButton } from "@/components/invoice-delete-button";
import { InvoiceMobileRow } from "@/components/invoice-mobile-row";
import { InvoicePdfViewerButton } from "@/components/invoice-pdf-viewer-button";
import { InvoiceResendEmailButton } from "@/components/invoice-resend-email-button";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import {
  approvePendingInvoiceApprovalAction,
  approvePendingInvoiceApprovalsAction,
  cancelPendingInvoiceApprovalAction,
  cancelPendingInvoiceApprovalsAction,
  uploadInvoiceAction,
} from "@/shared/actions/billing";
import { useNotifications } from "@/shared/hooks/use-notifications";
import type { Building, Invoice } from "@/shared/lib/data";
import type { DashboardRole } from "@/shared/role-ui";

type RawRecord = Record<string, unknown>;

type QueueStatus = "ready" | "uploading" | "success" | "error";

type InvoiceQueueItem = {
  id: string;
  file: File;
  previewUrl: string;
  externalId: string;
  amount: string;
  period: string;
  invoiceDate: string;
  currency: string;
  status: string;
  comment: string;
  uploadStatus: QueueStatus;
  resultMessage?: string;
};

type ApartmentOption = {
  id: string;
  label: string;
  buildingId: string;
};

const COPY = {
  en: {
    importTitle: "Manual invoice import",
    importDescription: "Upload PDF invoices and attach them to a building and apartment.",
    pageBuildingTitle: "Page building",
    pageBuildingDescription: "Invoices, import history, API approvals, and manual uploads use this building.",
    expandImport: "Expand",
    collapseImport: "Hide",
    queueTitle: "Upload queue",
    invoicesTitle: "Invoices and charges",
    invoicesDescription: "Billing visibility and debt control",
    historyTitle: "Import history",
    historyDescription: "Latest API and manual upload results",
    approvalButton: "API approvals",
    approvalModalTitle: "API invoices for approval",
    approvalModalDescription: "Approve invoices before they are attached to apartments.",
    approvalEmpty: "No API invoices waiting for approval.",
    approvalApprove: "Approve",
    approvalApproving: "Approving...",
    approvalApproved: "Invoice approved.",
    approvalFailed: "Could not approve the invoice.",
    approvalCancel: "Cancel",
    approvalCancelling: "Cancelling...",
    approvalCancelled: "Invoice approval cancelled.",
    approvalCancelFailed: "Could not cancel the invoice approval.",
    approvalApproveAll: "Approve all",
    approvalApprovingAll: "Approving all...",
    approvalApprovedAll: "All API invoices approved.",
    approvalApproveAllFailed: "Could not approve all API invoices.",
    approvalCancelAll: "Cancel all",
    approvalCancellingAll: "Cancelling all...",
    approvalCancelledAll: "All API invoices cancelled.",
    approvalCancelAllFailed: "Could not cancel all API invoices.",
    building: "Building",
    apartment: "Apartment",
    period: "Period",
    invoiceDate: "Invoice date",
    currency: "Currency",
    status: "Status",
    comment: "Comment",
    amount: "Amount",
    externalId: "External ID",
    chooseBuilding: "Choose building",
    chooseApartment: "Choose apartment",
    dropTitle: "Drop PDF files here",
    dropHint: "or choose one or more invoices",
    chooseFiles: "Choose PDF",
    preview: "Preview",
    noPreview: "Select a PDF in the queue to preview it.",
    upload: "Upload",
    uploading: "Uploading...",
    retry: "Retry",
    remove: "Remove",
    pdf: "PDF",
    openPdf: "Open PDF",
    openingPdf: "Opening...",
    openPdfFailed: "Could not open the invoice.",
    close: "Close",
    deleteInvoice: "Delete invoice",
    deleteInvoiceTitle: "Delete invoice",
    deleteInvoiceMessage: "This invoice will be removed.",
    deletingInvoice: "Deleting...",
    deleteInvoiceSuccess: "Invoice deleted.",
    deleteInvoiceFailed: "Could not delete the invoice.",
    resendInvoice: "Reissue invoice",
    resendingInvoice: "Sending...",
    resendInvoiceSuccess: "Invoice sent.",
    resendInvoiceFailed: "Could not send the invoice.",
    ready: "Ready",
    success: "Uploaded",
    error: "Error",
    emptyInvoices: "No invoices yet.",
    emptyHistory: "No imports yet.",
    loadFailed: "Could not load invoice data. Check the API connection and try again.",
    fileRejected: "Only PDF files can be uploaded.",
    selectBuilding: "Choose a building.",
    selectApartment: "Choose an apartment.",
    addFile: "Add at least one PDF file.",
    fillRequired: "Fill amount and external ID for every PDF.",
    uploaded: "Invoice upload completed.",
    partialUpload: "Some invoices were not uploaded.",
    uploadFailed: "Invoice upload failed.",
    paid: "Paid",
    overdue: "Overdue",
    pending: "Pending",
    issued: "Issued",
    draft: "Draft",
    cancelled: "Cancelled",
    colInvoice: "Client / home",
    colApartment: "Apartment",
    colResident: "Resident",
    colAmount: "Amount",
    colPeriod: "Period",
    colStatus: "Status",
    colFile: "File",
    colDate: "Date",
    colSource: "Source",
  },
  ru: {
    importTitle: "Ручной импорт счетов",
    importDescription: "Загрузите PDF-счета и привяжите их к дому и квартире.",
    pageBuildingTitle: "Дом страницы",
    pageBuildingDescription: "Счета, история импортов, API счета и ручная загрузка относятся к выбранному дому.",
    expandImport: "Развернуть",
    collapseImport: "Скрыть",
    queueTitle: "Очередь загрузки",
    invoicesTitle: "Счета и начисления",
    invoicesDescription: "Контроль начислений, PDF и статусов оплаты",
    historyTitle: "История импортов",
    historyDescription: "Последние результаты API и ручных загрузок",
    building: "Дом",
    apartment: "Квартира",
    period: "Период",
    invoiceDate: "Дата счета",
    currency: "Валюта",
    status: "Статус",
    comment: "Комментарий",
    amount: "Сумма",
    externalId: "Внешний ID",
    chooseBuilding: "Выберите дом",
    chooseApartment: "Выберите квартиру",
    dropTitle: "Перетащите PDF сюда",
    dropHint: "или выберите один или несколько счетов",
    chooseFiles: "Выбрать PDF",
    preview: "Предпросмотр",
    noPreview: "Выберите PDF в очереди для предпросмотра.",
    upload: "Загрузить",
    uploading: "Загружаем...",
    retry: "Повторить",
    remove: "Удалить",
    pdf: "PDF",
    openPdf: "Открыть PDF",
    openingPdf: "Открываем...",
    openPdfFailed: "Не удалось открыть счёт.",
    close: "Закрыть",
    deleteInvoice: "Удалить счёт",
    deleteInvoiceTitle: "Удалить счёт",
    deleteInvoiceMessage: "Счёт будет удалён.",
    deletingInvoice: "Удаляем...",
    deleteInvoiceSuccess: "Счёт удалён.",
    deleteInvoiceFailed: "Не удалось удалить счёт.",
    resendInvoice: "Повторно выставить",
    resendingInvoice: "Отправляем...",
    resendInvoiceSuccess: "Счёт повторно выставлен.",
    resendInvoiceFailed: "Не удалось повторно выставить счёт.",
    ready: "Готово",
    success: "Загружено",
    error: "Ошибка",
    emptyInvoices: "Счетов пока нет.",
    emptyHistory: "Импортов пока нет.",
    loadFailed: "Не удалось загрузить данные счетов. Проверьте подключение к API.",
    fileRejected: "Можно загружать только PDF-файлы.",
    selectBuilding: "Выберите дом.",
    selectApartment: "Выберите квартиру.",
    addFile: "Добавьте хотя бы один PDF-файл.",
    fillRequired: "Заполните сумму и внешний ID для каждого PDF.",
    uploaded: "Загрузка счета завершена.",
    partialUpload: "Некоторые счета не были загружены.",
    uploadFailed: "Не удалось загрузить счет.",
    paid: "Оплачен",
    overdue: "Просрочен",
    pending: "Ожидает",
    issued: "Выставлен",
    draft: "Черновик",
    cancelled: "Отменен",
    colInvoice: "Клиент / дом",
    colApartment: "Квартира",
    colResident: "Жилец",
    colAmount: "Сумма",
    colPeriod: "Период",
    colStatus: "Статус",
    colFile: "Файл",
    colDate: "Дата",
    colSource: "Источник",
    approvalButton: "API счета",
    approvalModalTitle: "API счета на одобрение",
    approvalModalDescription: "Одобрите счета перед прикреплением к квартирам.",
    approvalEmpty: "Нет API счетов на одобрение.",
    approvalApprove: "Одобрить",
    approvalApproving: "Одобряем...",
    approvalApproved: "Счет одобрен.",
    approvalFailed: "Не удалось одобрить счет.",
    approvalCancel: "Отменить",
    approvalCancelling: "Отменяем...",
    approvalCancelled: "API счет отменен.",
    approvalCancelFailed: "Не удалось отменить API счет.",
    approvalApproveAll: "Одобрить всё",
    approvalApprovingAll: "Одобряем всё...",
    approvalApprovedAll: "Все API счета одобрены.",
    approvalApproveAllFailed: "Не удалось одобрить все API счета.",
    approvalCancelAll: "Отменить всё",
    approvalCancellingAll: "Отменяем всё...",
    approvalCancelledAll: "Все API счета отменены.",
    approvalCancelAllFailed: "Не удалось отменить все API счета.",
  },
  lv: {
    importTitle: "Manuala rekinu importesana",
    importDescription: "Augspieladejiet PDF rekinus un piesaistiet tos ekai un dzivoklim.",
    pageBuildingTitle: "Lapas eka",
    pageBuildingDescription: "Rekini, importa vesture, API apstiprinajumi un manuala augspielade izmanto so eku.",
    expandImport: "Izverst",
    collapseImport: "Paslept",
    queueTitle: "Augspielades rinda",
    invoicesTitle: "Rekini un maksajumi",
    invoicesDescription: "Rekinu, PDF un apmaksas statusu kontrole",
    historyTitle: "Importa vesture",
    historyDescription: "Jaunakie API un manualas augspielades rezultati",
    approvalButton: "API apstiprinajumi",
    approvalModalTitle: "API rekini apstiprinasanai",
    approvalModalDescription: "Apstipriniet rekinus pirms piesaistes dzivokliem.",
    approvalEmpty: "Nav API rekinu apstiprinasanai.",
    approvalApprove: "Apstiprinat",
    approvalApproving: "Apstiprina...",
    approvalApproved: "Rekins apstiprinats.",
    approvalFailed: "Neizdevas apstiprinat rekinu.",
    approvalCancel: "Atcelt",
    approvalCancelling: "Atcel...",
    approvalCancelled: "API rekina apstiprinasana atcelta.",
    approvalCancelFailed: "Neizdevas atcelt API rekinu.",
    approvalApproveAll: "Apstiprinat visus",
    approvalApprovingAll: "Apstiprina visus...",
    approvalApprovedAll: "Visi API rekini apstiprinati.",
    approvalApproveAllFailed: "Neizdevas apstiprinat visus API rekinus.",
    approvalCancelAll: "Atcelt visus",
    approvalCancellingAll: "Atcel visus...",
    approvalCancelledAll: "Visi API rekini atcelti.",
    approvalCancelAllFailed: "Neizdevas atcelt visus API rekinus.",
    building: "Eka",
    apartment: "Dzivoklis",
    period: "Periods",
    invoiceDate: "Rekina datums",
    currency: "Valuta",
    status: "Statuss",
    comment: "Komentars",
    amount: "Summa",
    externalId: "Arejais ID",
    chooseBuilding: "Izvelieties eku",
    chooseApartment: "Izvelieties dzivokli",
    dropTitle: "Ievelciet PDF failus seit",
    dropHint: "vai izvelieties vienu vai vairakus rekinus",
    chooseFiles: "Izveleties PDF",
    preview: "Priekskatijums",
    noPreview: "Izvelieties PDF rinda, lai to apskatitu.",
    upload: "Augspieladet",
    uploading: "Augspielade...",
    retry: "Atkartot",
    remove: "Nonemt",
    pdf: "PDF",
    openPdf: "Atvert PDF",
    openingPdf: "Atver...",
    openPdfFailed: "Neizdevas atvert rekinu.",
    close: "Aizvert",
    deleteInvoice: "Dzest rekinu",
    deleteInvoiceTitle: "Dzest rekinu",
    deleteInvoiceMessage: "Rekins tiks nonemts.",
    deletingInvoice: "Dzes...",
    deleteInvoiceSuccess: "Rekins dzests.",
    deleteInvoiceFailed: "Neizdevas dzest rekinu.",
    resendInvoice: "Atkartoti izrakstit",
    resendingInvoice: "Suta...",
    resendInvoiceSuccess: "Rekins atkartoti izrakstits.",
    resendInvoiceFailed: "Neizdevas atkartoti izrakstit rekinu.",
    ready: "Gatavs",
    success: "Augspieladets",
    error: "Kluda",
    emptyInvoices: "Rekinu vel nav.",
    emptyHistory: "Importu vel nav.",
    loadFailed: "Neizdevas ieladet rekinu datus. Parbaudiet API savienojumu.",
    fileRejected: "Var augspieladet tikai PDF failus.",
    selectBuilding: "Izvelieties eku.",
    selectApartment: "Izvelieties dzivokli.",
    addFile: "Pievienojiet vismaz vienu PDF failu.",
    fillRequired: "Aizpildiet summu un arejo ID katram PDF.",
    uploaded: "Rekina augspielade pabeigta.",
    partialUpload: "Dazi rekini netika augspieladeti.",
    uploadFailed: "Neizdevās augspieladet rekinu.",
    paid: "Apmaksats",
    overdue: "Kavets",
    pending: "Gaida",
    issued: "Izrakstits",
    draft: "Melnraksts",
    cancelled: "Atcelts",
    colInvoice: "Klients / maja",
    colApartment: "Dzivoklis",
    colResident: "Iedzivotajs",
    colAmount: "Summa",
    colPeriod: "Periods",
    colStatus: "Statuss",
    colFile: "Fails",
    colDate: "Datums",
    colSource: "Avots",
  },
} as const;

type Copy = { readonly [Key in keyof typeof COPY.en]: string };

const STATUS_OPTIONS = ["pending", "issued", "paid", "overdue", "cancelled", "draft"] as const;
function getCopy(locale: string): Copy {
  if (locale.startsWith("ru")) return COPY.ru as Copy;
  if (locale.startsWith("lv")) return COPY.lv as Copy;
  return COPY.en;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function asRecord(value: unknown): RawRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RawRecord) : {};
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function currentPeriodValue() {
  return new Date().toISOString().slice(0, 7);
}

function monthValueFromInvoice(...values: unknown[]) {
  for (const value of values) {
    const raw = firstString(value);
    if (!raw) continue;

    const directMonth = raw.match(/^(\d{4})-(\d{2})$/);
    if (directMonth) return `${directMonth[1]}-${directMonth[2]}`;

    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 7);
    }
  }

  return "";
}

function queueId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function inferFileMetadata(file: File) {
  const baseName = file.name.replace(/\.pdf$/i, "");
  const normalized = baseName.replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "");
  const yearMonth = baseName.match(/(20\d{2})[-_.](0?[1-9]|1[0-2])/);
  const monthYear = baseName.match(/(0?[1-9]|1[0-2])[-_.](20\d{2})/);
  const dateMatch = baseName.match(/(20\d{2})[-_.](0?[1-9]|1[0-2])[-_.](0?[1-9]|[12]\d|3[01])/);
  const amountMatch = baseName.match(/(?:^|[-_\s])(\d{1,7}(?:[,.]\d{2}))\s*(EUR|USD|GBP|PLN|SEK)?/i);
  const status = /overdue|late|debt/i.test(baseName)
    ? "overdue"
    : /paid/i.test(baseName)
      ? "paid"
      : /cancel/i.test(baseName)
        ? "cancelled"
        : "pending";

  return {
    externalId: normalized || baseName || file.name,
    period: yearMonth
      ? `${yearMonth[1]}-${String(Number(yearMonth[2])).padStart(2, "0")}`
      : monthYear
        ? `${monthYear[2]}-${String(Number(monthYear[1])).padStart(2, "0")}`
        : currentPeriodValue(),
    invoiceDate: dateMatch
      ? `${dateMatch[1]}-${String(Number(dateMatch[2])).padStart(2, "0")}-${String(Number(dateMatch[3])).padStart(2, "0")}`
      : todayInputValue(),
    amount: amountMatch?.[1]?.replace(",", ".") ?? "",
    currency: amountMatch?.[2]?.toUpperCase() ?? "EUR",
    status,
  };
}

function formatHistoryDate(value: unknown) {
  const raw = firstString(value);
  if (!raw) return "-";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;

  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

function pendingApprovalPdfHref(id: string) {
  return `/api/invoices/pending-approvals/${encodeURIComponent(id)}/pdf`;
}

function statusLabel(status: string, copy: Copy) {
  const key = status.toLowerCase() as keyof Pick<Copy, "paid" | "overdue" | "pending" | "issued" | "draft" | "cancelled">;
  return copy[key] ?? status;
}

function StatusBadge({ status, copy }: { status: string; copy: Copy }) {
  const normalized = status.toLowerCase();
  const styles =
    normalized === "paid"
      ? "bg-emerald-50 text-emerald-700"
      : normalized === "overdue"
        ? "bg-rose-50 text-rose-700"
        : normalized === "cancelled"
          ? "bg-slate-100 text-slate-600"
          : "bg-amber-50 text-amber-700";

  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${styles}`}>
      {statusLabel(normalized, copy)}
    </span>
  );
}

function QueueStatusBadge({ status, copy }: { status: QueueStatus; copy: Copy }) {
  const styles =
    status === "success"
      ? "bg-emerald-50 text-emerald-700"
      : status === "error"
        ? "bg-rose-50 text-rose-700"
        : status === "uploading"
          ? "bg-blue-50 text-blue-700"
          : "bg-slate-100 text-slate-600";

  const Icon = status === "success" ? FiCheckCircle : status === "error" ? FiAlertCircle : FiFileText;
  const label = status === "success" ? copy.success : status === "error" ? copy.error : status === "uploading" ? copy.uploading : copy.ready;

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${styles}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}

export function InvoicesWorkspace({
  role,
  companyId,
  invoices,
  buildings,
  apartments,
  uploadHistory,
  pendingApprovals,
  uploadHistoryError,
  pendingApprovalsError,
}: {
  role: DashboardRole;
  companyId?: string;
  invoices: Invoice[];
  buildings: Building[];
  apartments: RawRecord[];
  uploadHistory: RawRecord[];
  pendingApprovals: RawRecord[];
  uploadHistoryError?: string;
  pendingApprovalsError?: string;
}) {
  const locale = useLocale();
  const copy = getCopy(locale);
  const notifications = useNotifications();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<InvoiceQueueItem[]>([]);
  const canImport = role === "managementCompany";

  const buildingOptions = useMemo(
    () => buildings.map((building) => ({ id: building.id, label: building.name || building.address || building.id })),
    [buildings],
  );
  const buildingLabelById = useMemo(
    () => new Map(buildings.map((building) => [building.id, building.name || building.address || building.id])),
    [buildings],
  );

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

  const [selectedBuildingId, setSelectedBuildingId] = useState(buildingOptions[0]?.id ?? "");
  const [selectedApartmentId, setSelectedApartmentId] = useState("");
  const [selectedInvoiceApartmentId, setSelectedInvoiceApartmentId] = useState("");
  const [defaultPeriod, setDefaultPeriod] = useState(currentPeriodValue());
  const [selectedInvoicePeriod, setSelectedInvoicePeriod] = useState(currentPeriodValue());
  const [defaultInvoiceDate, setDefaultInvoiceDate] = useState(todayInputValue());
  const [defaultAmount, setDefaultAmount] = useState("");
  const [defaultStatus, setDefaultStatus] = useState("pending");
  const [defaultComment, setDefaultComment] = useState("");
  const [queue, setQueue] = useState<InvoiceQueueItem[]>([]);
  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [approvingApprovalId, setApprovingApprovalId] = useState<string | null>(null);
  const [cancellingApprovalId, setCancellingApprovalId] = useState<string | null>(null);
  const [approvingAllApprovals, setApprovingAllApprovals] = useState(false);
  const [cancellingAllApprovals, setCancellingAllApprovals] = useState(false);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    return () => {
      for (const item of queueRef.current) {
        URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedBuildingId && buildingOptions[0]?.id) {
      setSelectedBuildingId(buildingOptions[0].id);
    }
  }, [buildingOptions, selectedBuildingId]);

  const filteredApartmentOptions = useMemo(
    () =>
      selectedBuildingId
        ? apartmentOptions.filter((apartment) => !apartment.buildingId || apartment.buildingId === selectedBuildingId)
        : apartmentOptions,
    [apartmentOptions, selectedBuildingId],
  );

  useEffect(() => {
    if (selectedApartmentId && !filteredApartmentOptions.some((apartment) => apartment.id === selectedApartmentId)) {
      setSelectedApartmentId("");
    }
  }, [filteredApartmentOptions, selectedApartmentId]);

  useEffect(() => {
    if (canImport) return;

    const firstApartmentId = apartmentOptions[0]?.id ?? "";
    if (!selectedInvoiceApartmentId && firstApartmentId) {
      setSelectedInvoiceApartmentId(firstApartmentId);
      return;
    }

    if (
      selectedInvoiceApartmentId &&
      !apartmentOptions.some((apartment) => apartment.id === selectedInvoiceApartmentId)
    ) {
      setSelectedInvoiceApartmentId(firstApartmentId);
    }
  }, [apartmentOptions, canImport, selectedInvoiceApartmentId]);

  const selectedQueueItem = queue.find((item) => item.id === selectedQueueId) ?? queue[0];

  function openPreview(id: string) {
    setSelectedQueueId(id);
    setPreviewModalOpen(true);
  }

  function addFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    const pdfFiles = files.filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
    if (pdfFiles.length !== files.length) {
      notifications.warning(copy.fileRejected);
    }

    if (!pdfFiles.length) return;

    const nextItems = pdfFiles.map((file) => {
      const id = queueId();
      const inferred = inferFileMetadata(file);
      return {
        id,
        file,
        previewUrl: URL.createObjectURL(file),
        externalId: `${inferred.externalId || "manual-invoice"}-${id.slice(0, 8)}`,
        amount: inferred.amount,
        period: defaultPeriod,
        invoiceDate: defaultInvoiceDate,
        currency: "EUR",
        status: defaultStatus,
        comment: defaultComment,
        uploadStatus: "ready" as QueueStatus,
      };
    });

    if (queue.length === 0 && nextItems[0]) {
      setSelectedQueueId(nextItems[0].id);
    }

    setQueue((items) => [...items, ...nextItems]);
  }

  function removeQueueItem(id: string) {
    setQueue((items) => {
      const target = items.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      const nextItems = items.filter((item) => item.id !== id);
      if (selectedQueueId === id) {
        const nextSelectedId = nextItems[0]?.id ?? null;
        setSelectedQueueId(nextSelectedId);
        if (!nextSelectedId) setPreviewModalOpen(false);
      }
      return nextItems;
    });
  }

  function removeQueueItems(ids: string[]) {
    const idSet = new Set(ids);
    if (!idSet.size) return;

    setQueue((items) => {
      for (const item of items) {
        if (idSet.has(item.id)) URL.revokeObjectURL(item.previewUrl);
      }

      const nextItems = items.filter((item) => !idSet.has(item.id));
      if (selectedQueueId && idSet.has(selectedQueueId)) {
        setSelectedQueueId(nextItems[0]?.id ?? null);
      }
      if (!nextItems.length) setPreviewModalOpen(false);
      return nextItems;
    });
  }

  function resetImportForm() {
    for (const item of queueRef.current) {
      URL.revokeObjectURL(item.previewUrl);
    }
    setQueue([]);
    setSelectedQueueId(null);
    setPreviewModalOpen(false);
    setSelectedApartmentId("");
    setDefaultPeriod(currentPeriodValue());
    setDefaultInvoiceDate(todayInputValue());
    setDefaultAmount("");
    setDefaultStatus("pending");
    setDefaultComment("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function updateQueueItem(id: string, patch: Partial<InvoiceQueueItem>) {
    setQueue((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function applyQueueDefaults(patch: Partial<Pick<InvoiceQueueItem, "period" | "invoiceDate" | "currency" | "status">>) {
    setQueue((items) => items.map((item) => (item.uploadStatus === "success" ? item : { ...item, ...patch })));
  }

  function validateUpload(items: InvoiceQueueItem[]) {
    if (!selectedBuildingId) {
      notifications.warning(copy.selectBuilding);
      return false;
    }
    if (!selectedApartmentId) {
      notifications.warning(copy.selectApartment);
      return false;
    }
    if (!items.length) {
      notifications.warning(copy.addFile);
      return false;
    }
    if (!defaultAmount.trim()) {
      notifications.warning(copy.fillRequired);
      return false;
    }

    return true;
  }

  async function uploadOne(item: InvoiceQueueItem) {
    updateQueueItem(item.id, { uploadStatus: "uploading", resultMessage: undefined });

    try {
      const formData = new FormData();
      formData.append("file", item.file, item.file.name);
      formData.append("buildingId", selectedBuildingId);
      formData.append("apartmentId", selectedApartmentId);
      formData.append("period", defaultPeriod);
      formData.append("invoiceDate", defaultInvoiceDate);
      formData.append("amount", defaultAmount.trim());
      formData.append("currency", "EUR");
      formData.append("externalId", item.externalId);
      formData.append("status", defaultStatus);
      formData.append("source", "manual");
      if (defaultComment.trim()) formData.append("comment", defaultComment.trim());
      if (companyId?.trim()) formData.append("companyId", companyId.trim());

      const response = await uploadInvoiceAction(formData);

      if (!response.success) {
        throw new Error(response.error || copy.uploadFailed);
      }

      updateQueueItem(item.id, {
        uploadStatus: "success",
        resultMessage: response.invoice_id ?? response.message ?? copy.success,
      });
      return true;
    } catch (error) {
      updateQueueItem(item.id, {
        uploadStatus: "error",
        resultMessage: error instanceof Error ? error.message : copy.uploadFailed,
      });
      return false;
    }
  }

  async function handleUploadAll() {
    const pendingItems = queue.filter((item) => item.uploadStatus !== "success");
    if (!validateUpload(pendingItems)) return;

    setUploading(true);
    let uploadedCount = 0;
    const uploadedIds: string[] = [];
    for (const item of pendingItems) {
      if (await uploadOne(item)) {
        uploadedCount += 1;
        uploadedIds.push(item.id);
      }
    }
    setUploading(false);

    if (uploadedCount === pendingItems.length) {
      notifications.success(copy.uploaded);
      resetImportForm();
    } else {
      notifications.error(copy.partialUpload);
      removeQueueItems(uploadedIds);
    }
  }

  async function handleRetry(item: InvoiceQueueItem) {
    if (!validateUpload([item])) return;
    setUploading(true);
    const ok = await uploadOne(item);
    setUploading(false);
    if (ok) {
      notifications.success(copy.uploaded);
      if (queue.length <= 1) {
        resetImportForm();
      } else {
        removeQueueItems([item.id]);
      }
    } else {
      notifications.error(copy.uploadFailed);
    }
  }

  async function handleApprovePendingApproval(approvalId: string) {
    setApprovingApprovalId(approvalId);
    try {
      const response = await approvePendingInvoiceApprovalAction(approvalId);
      if (!response.success) {
        throw new Error(response.message || copy.approvalFailed);
      }

      notifications.success(copy.approvalApproved);
    } catch (error) {
      notifications.error(error instanceof Error ? error.message : copy.approvalFailed);
    } finally {
      setApprovingApprovalId(null);
    }
  }

  async function handleCancelPendingApproval(approvalId: string) {
    setCancellingApprovalId(approvalId);
    try {
      const response = await cancelPendingInvoiceApprovalAction(approvalId);
      if (!response.success) {
        throw new Error(response.message || copy.approvalCancelFailed);
      }

      notifications.success(copy.approvalCancelled);
    } catch (error) {
      notifications.error(error instanceof Error ? error.message : copy.approvalCancelFailed);
    } finally {
      setCancellingApprovalId(null);
    }
  }

  function visibleApprovalIds() {
    return filteredPendingApprovals
      .map((item) => firstString(item.id, item.approvalId))
      .filter(Boolean);
  }

  async function handleApproveAllPendingApprovals() {
    const approvalIds = visibleApprovalIds();
    if (approvalIds.length === 0) return;

    setApprovingAllApprovals(true);
    try {
      const response = await approvePendingInvoiceApprovalsAction(approvalIds);
      if (!response.success) {
        throw new Error(response.message || `${copy.approvalApproveAllFailed} ${response.processed ?? 0}/${response.total ?? approvalIds.length}`);
      }

      notifications.success(copy.approvalApprovedAll);
    } catch (error) {
      notifications.error(error instanceof Error ? error.message : copy.approvalApproveAllFailed);
    } finally {
      setApprovingAllApprovals(false);
    }
  }

  async function handleCancelAllPendingApprovals() {
    const approvalIds = visibleApprovalIds();
    if (approvalIds.length === 0) return;

    setCancellingAllApprovals(true);
    try {
      const response = await cancelPendingInvoiceApprovalsAction(approvalIds);
      if (!response.success) {
        throw new Error(response.message || `${copy.approvalCancelAllFailed} ${response.processed ?? 0}/${response.total ?? approvalIds.length}`);
      }

      notifications.success(copy.approvalCancelledAll);
    } catch (error) {
      notifications.error(error instanceof Error ? error.message : copy.approvalCancelAllFailed);
    } finally {
      setCancellingAllApprovals(false);
    }
  }

  function handleDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragActive(false);
    addFiles(event.dataTransfer.files);
  }

  function matchesSelectedBuilding(...values: unknown[]) {
    if (!selectedBuildingId) return true;
    return values.some((value) => firstString(value) === selectedBuildingId);
  }

  function matchesSelectedInvoiceApartment(item: Invoice) {
    if (!selectedInvoiceApartmentId) return true;

    const selectedApartment = apartmentOptions.find((apartment) => apartment.id === selectedInvoiceApartmentId);
    const selectedApartmentNumber = selectedApartment?.label.split(" - ")[0] ?? "";

    return [item.apartmentId, item.apartment, item.apartmentNumber, item.displayNumber].some((value) => {
      const normalized = firstString(value);
      return normalized === selectedInvoiceApartmentId || (selectedApartmentNumber && normalized === selectedApartmentNumber);
    });
  }

  const filteredInvoices = invoices.filter((item) => {
    if (!canImport) {
      return matchesSelectedInvoiceApartment(item);
    }

    const invoicePeriod = monthValueFromInvoice(item.period, item.invoiceDate, item.dueDate);
    return matchesSelectedBuilding(item.buildingId) && (!selectedInvoicePeriod || invoicePeriod === selectedInvoicePeriod);
  });
  const filteredUploadHistory = uploadHistory.filter((item) => {
    const metadata = asRecord(item.metadata);
    return matchesSelectedBuilding(item.buildingId, metadata.buildingId);
  });
  const filteredPendingApprovals = pendingApprovals.filter((item) => matchesSelectedBuilding(item.buildingId));
  const hasVisibleApprovals = filteredPendingApprovals.length > 0;

  const invoiceRows = filteredInvoices.map((item) => {
    const invoiceLabel = item.displayNumber || item.externalId || item.id;
    const invoiceTitle = item.fileName || invoiceLabel;
    const secondaryLabel = firstString(
      item.accountNumber,
      item.contractNumber,
      item.apartmentNumber,
      item.buildingNumber,
      item.externalId,
    );

    const row = [
      <div key={`${item.id}-invoice`} className="min-w-44">
        <p className="font-medium text-slate-900">{invoiceLabel}</p>
        {secondaryLabel && secondaryLabel !== invoiceLabel ? (
          <p className="mt-0.5 text-xs text-slate-500">{secondaryLabel}</p>
        ) : null}
      </div>,
      item.apartment,
      item.resident,
      item.amount,
      item.period ?? item.invoiceDate ?? item.dueDate,
    ];

    if (canImport) {
      row.push(<StatusBadge key={`${item.id}-status`} status={item.status} copy={copy} />);
    }

    row.push(
      <div key={`${item.id}-actions`} className="flex items-center gap-2">
        {item.pdfUrl ? (
          <InvoicePdfViewerButton
            href={item.pdfUrl}
            label={copy.pdf}
            title={invoiceTitle}
            closeLabel={copy.close}
            loadingLabel={copy.openingPdf}
            errorLabel={copy.openPdfFailed}
          />
        ) : (
          <span className="text-xs text-slate-400">-</span>
        )}
        {canImport ? (
          <InvoiceResendEmailButton
            invoiceId={item.id}
            label={copy.resendInvoice}
            sendingLabel={copy.resendingInvoice}
            successLabel={copy.resendInvoiceSuccess}
            errorLabel={copy.resendInvoiceFailed}
          />
        ) : null}
        {canImport ? (
          <InvoiceDeleteButton
            invoiceId={item.id}
            label={copy.deleteInvoice}
            title={`${copy.deleteInvoiceTitle} ${invoiceLabel}?`}
            message={copy.deleteInvoiceMessage}
            confirmLabel={copy.deleteInvoice}
            cancelLabel={copy.close}
            deletingLabel={copy.deletingInvoice}
            successLabel={copy.deleteInvoiceSuccess}
            errorLabel={copy.deleteInvoiceFailed}
          />
        ) : null}
      </div>,
    );

    return row;
  });
  const invoiceMobileRows = filteredInvoices.map((item) => {
    const invoiceLabel = item.displayNumber || item.externalId || item.id;

    return (
      <InvoiceMobileRow
        key={item.id}
        id={item.id}
        period={item.period}
        fallbackDate={item.invoiceDate ?? item.dueDate}
        amount={item.amount}
        pdfUrl={item.pdfUrl}
        fileName={item.fileName}
        fallbackTitle={invoiceLabel}
        locale={locale}
        viewLabel={copy.pdf}
        closeLabel={copy.close}
        loadingLabel={copy.openingPdf}
        errorLabel={copy.openPdfFailed}
      />
    );
  });

  const historyRows = filteredUploadHistory.map((item, index) => {
    const status = firstString(item.status, "error");
    const source = firstString(item.source, "manual");
    const metadata = asRecord(item.metadata);
    const metadataResults = Array.isArray(metadata.results) ? metadata.results : [];
    const singleResult = metadataResults.length === 1 ? asRecord(metadataResults[0]) : {};
    const invoiceId = firstString(item.invoiceId, metadata.invoiceId, singleResult.invoice_id);
    const approvalId = firstString(item.approvalId, metadata.approvalId, singleResult.approval_id);
    const previewHref = invoiceId
      ? `/api/invoices/${encodeURIComponent(invoiceId)}/pdf`
      : approvalId
        ? pendingApprovalPdfHref(approvalId)
        : "";
    const fileName = firstString(item.fileName) || "-";
    const historyBuildingId = firstString(item.buildingId, metadata.buildingId);
    const apiName = firstString(item.apiName, metadata.apiName, metadata.apiKeyLabel, metadata.apiKeyId);
    const rawHistoryId = firstString(item.id);
    const fallbackLabel = source.toLowerCase() === "api" && rawHistoryId.startsWith("batch_")
      ? firstString(buildingLabelById.get(historyBuildingId), historyBuildingId, "API")
      : rawHistoryId;
    const historyLabel = firstString(
      item.clientNumber,
      metadata.clientNumber,
      item.accountNumber,
      metadata.accountNumber,
      item.clientId,
      metadata.clientId,
      item.buildingName,
      metadata.buildingName,
      buildingLabelById.get(historyBuildingId),
      invoiceId,
      approvalId,
      item.externalId,
      fallbackLabel,
    ) || "-";
    const historyTitle = apiName ? `${historyLabel} (${apiName})` : historyLabel;

    return [
      <div key={`${index}-history-id`}>
        <p className="font-medium text-slate-900">{historyTitle}</p>
        {firstString(item.error) ? <p className="mt-0.5 text-xs text-rose-600">{firstString(item.error)}</p> : null}
      </div>,
      <div key={`${index}-history-file`} className="flex min-w-44 items-center gap-2">
        <span className="truncate">{fileName}</span>
        {source.toLowerCase() === "api" && status === "success" && previewHref ? (
          <InvoicePdfViewerButton
            href={previewHref}
            label={copy.pdf}
            title={fileName}
            closeLabel={copy.close}
            loadingLabel={copy.openingPdf}
            errorLabel={copy.openPdfFailed}
          />
        ) : null}
      </div>,
      source,
      formatHistoryDate(item.createdAt),
      status === "success" ? (
        <QueueStatusBadge key={`${index}-success`} status="success" copy={copy} />
      ) : status === "pending" ? (
        <StatusBadge key={`${index}-pending`} status="pending" copy={copy} />
      ) : status === "cancelled" ? (
        <StatusBadge key={`${index}-cancelled`} status="cancelled" copy={copy} />
      ) : status === "duplicate" || status === "error" ? (
        <QueueStatusBadge key={`${index}-error`} status="error" copy={copy} />
      ) : (
        <QueueStatusBadge key={`${index}-ready`} status="ready" copy={copy} />
      ),
    ];
  });

  const approvalRows = filteredPendingApprovals.map((item, index) => {
    const approvalId = firstString(item.id, item.approvalId);
    const invoiceLabel = firstString(
      item.accountId,
      item.clientNumber,
      item.contractNumber,
      item.apartmentNumber,
      item.externalId,
      approvalId,
    );
    const amount = firstString(item.amount);
    const currency = firstString(item.currency, "EUR");

    return [
      <div key={`${approvalId || index}-approval-invoice`} className="min-w-44">
        <p className="font-medium text-slate-900">{invoiceLabel || "-"}</p>
        {firstString(item.externalId) && firstString(item.externalId) !== invoiceLabel ? (
          <p className="mt-0.5 text-xs text-slate-500">{firstString(item.externalId)}</p>
        ) : null}
      </div>,
      firstString(item.apartmentNumber, item.apartmentId) || "-",
      amount ? `${currency} ${amount}` : "-",
      firstString(item.period, item.invoiceDate, item.createdAt) || "-",
      <div key={`${approvalId || index}-approval-actions`} className="flex items-center justify-end gap-2">
        {approvalId ? (
          <InvoicePdfViewerButton
            href={pendingApprovalPdfHref(approvalId)}
            label={copy.pdf}
            title={`${copy.colInvoice} ${invoiceLabel || approvalId}`}
            closeLabel={copy.close}
            loadingLabel={copy.openingPdf}
            errorLabel={copy.openPdfFailed}
          />
        ) : null}
        <Button
          type="button"
          size="sm"
          onClick={() => void handleApprovePendingApproval(approvalId)}
          disabled={!approvalId || approvingAllApprovals || cancellingAllApprovals || approvingApprovalId === approvalId || cancellingApprovalId === approvalId}
        >
          <FiCheckCircle className="h-4 w-4" aria-hidden="true" />
          {approvingApprovalId === approvalId ? copy.approvalApproving : copy.approvalApprove}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => void handleCancelPendingApproval(approvalId)}
          disabled={!approvalId || approvingAllApprovals || cancellingAllApprovals || approvingApprovalId === approvalId || cancellingApprovalId === approvalId}
        >
          <FiX className="h-4 w-4" aria-hidden="true" />
          {cancellingApprovalId === approvalId ? copy.approvalCancelling : copy.approvalCancel}
        </Button>
      </div>,
    ];
  });

  return (
    <div className="space-y-6">
      {canImport && previewModalOpen && selectedQueueItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onClick={() => setPreviewModalOpen(false)}>
          <div
            className="flex max-h-[calc(100dvh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="invoice-preview-title"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div className="min-w-0">
                <h2 id="invoice-preview-title" className="text-lg font-semibold text-slate-950">{copy.preview}</h2>
                <p className="mt-1 truncate text-sm text-slate-500">{selectedQueueItem.file.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewModalOpen(false)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                aria-label={copy.close}
              >
                <FiX className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <iframe
              src={selectedQueueItem.previewUrl}
              title={`${copy.preview}: ${selectedQueueItem.file.name}`}
              className="h-[72dvh] min-h-[420px] w-full bg-white"
            />
          </div>
        </div>
      ) : null}

      {canImport && approvalModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onClick={() => setApprovalModalOpen(false)}>
          <div
            className="flex max-h-[calc(100dvh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="invoice-approval-title"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 id="invoice-approval-title" className="text-lg font-semibold text-slate-950">{copy.approvalModalTitle}</h2>
                <p className="mt-1 text-sm text-slate-500">{copy.approvalModalDescription}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void handleApproveAllPendingApprovals()}
                  disabled={!hasVisibleApprovals || approvingAllApprovals || cancellingAllApprovals}
                >
                  <FiCheckCircle className="h-4 w-4" aria-hidden="true" />
                  {approvingAllApprovals ? copy.approvalApprovingAll : copy.approvalApproveAll}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => void handleCancelAllPendingApprovals()}
                  disabled={!hasVisibleApprovals || approvingAllApprovals || cancellingAllApprovals}
                >
                  <FiX className="h-4 w-4" aria-hidden="true" />
                  {cancellingAllApprovals ? copy.approvalCancellingAll : copy.approvalCancelAll}
                </Button>
                <button
                  type="button"
                  onClick={() => setApprovalModalOpen(false)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                  aria-label={copy.close}
                >
                  <FiX className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {pendingApprovalsError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-5 text-sm text-rose-700">
                  {copy.loadFailed}{pendingApprovalsError}
                </div>
              ) : approvalRows.length ? (
                <DataTable
                  columns={[copy.colInvoice, copy.colApartment, copy.colAmount, copy.colPeriod, copy.colFile]}
                  rows={approvalRows}
                  pageSize={25}
                />
              ) : (
                <div className="rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-500">{copy.approvalEmpty}</div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {canImport ? (
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="grid gap-4 p-5 lg:grid-cols-[minmax(280px,1fr)_220px_auto] lg:items-end">
            <label className="flex min-w-0 flex-col gap-1.5 text-sm">
              <span className="font-semibold text-slate-900">{copy.pageBuildingTitle}</span>
              <select
                value={selectedBuildingId}
                onChange={(event) => setSelectedBuildingId(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">{copy.chooseBuilding}</option>
                {buildingOptions.map((building) => (
                  <option key={building.id} value={building.id}>{building.label}</option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1.5 text-sm">
              <span className="font-semibold text-slate-900">{copy.period}</span>
              <input
                type="month"
                value={selectedInvoicePeriod}
                onChange={(event) => setSelectedInvoicePeriod(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
              <Button type="button" variant="secondary" onClick={() => setApprovalModalOpen(true)}>
                <FiFileText className="h-4 w-4" aria-hidden="true" />
                {copy.approvalButton}
                {filteredPendingApprovals.length ? (
                  <span className="ml-1 rounded-full bg-blue-600 px-2 py-0.5 text-xs font-bold text-white">{filteredPendingApprovals.length}</span>
                ) : null}
              </Button>
              <Button type="button" variant={importOpen ? "primary" : "secondary"} onClick={() => setImportOpen((open) => !open)}>
                <FiUploadCloud className="h-4 w-4" aria-hidden="true" />
                {importOpen ? copy.collapseImport : copy.importTitle}
              </Button>
            </div>
          </div>

          {importOpen ? (
            <div className="border-t border-slate-200 p-5">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,460px)]">
            <div className="space-y-4">
              <div className="grid gap-3">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-slate-700">{copy.apartment}</span>
                  <select
                    value={selectedApartmentId}
                    onChange={(event) => setSelectedApartmentId(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">{copy.chooseApartment}</option>
                    {filteredApartmentOptions.map((apartment) => (
                      <option key={apartment.id} value={apartment.id}>{apartment.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-slate-700">{copy.period}</span>
                  <input
                    type="month"
                    value={defaultPeriod}
                    onChange={(event) => {
                      setDefaultPeriod(event.target.value);
                      applyQueueDefaults({ period: event.target.value });
                    }}
                    className="rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-slate-700">{copy.invoiceDate}</span>
                  <input
                    type="date"
                    value={defaultInvoiceDate}
                    onChange={(event) => {
                      setDefaultInvoiceDate(event.target.value);
                      applyQueueDefaults({ invoiceDate: event.target.value });
                    }}
                    className="rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-slate-700">{copy.amount}</span>
                  <input
                    value={defaultAmount}
                    onChange={(event) => setDefaultAmount(event.target.value)}
                    inputMode="decimal"
                    placeholder="0.00"
                    className="rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-slate-700">{copy.status}</span>
                  <select
                    value={defaultStatus}
                    onChange={(event) => {
                      setDefaultStatus(event.target.value);
                      applyQueueDefaults({ status: event.target.value });
                    }}
                    className="rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{statusLabel(status, copy)}</option>)}
                  </select>
                </label>
              </div>

              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-slate-700">{copy.comment}</span>
                <textarea
                  value={defaultComment}
                  onChange={(event) => setDefaultComment(event.target.value)}
                  rows={3}
                  className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>
            </div>

          <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <label
                htmlFor="invoice-pdf-input"
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                className={`flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-5 py-8 text-center transition ${
                  dragActive ? "border-blue-400 bg-blue-50" : "border-slate-300 bg-white hover:border-blue-300 hover:bg-blue-50/60"
                }`}
              >
                <FiUploadCloud className="h-10 w-10 text-blue-600" aria-hidden="true" />
                <span className="mt-3 text-sm font-semibold text-slate-900">{copy.dropTitle}</span>
                <span className="mt-1 text-xs text-slate-500">{copy.dropHint}</span>
                <span className="mt-4 inline-flex items-center rounded-lg bg-white px-3 py-2 text-xs font-semibold text-blue-700 shadow-sm">
                  {copy.chooseFiles}
                </span>
                <input
                  ref={fileInputRef}
                  id="invoice-pdf-input"
                  type="file"
                  accept="application/pdf,.pdf"
                  multiple
                  className="sr-only"
                  onChange={(event) => {
                    if (event.target.files) addFiles(event.target.files);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-sm font-semibold text-slate-900">{copy.queueTitle}</h3>
            </div>

            {queue.length ? (
              <>
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                      <thead className="bg-slate-50 text-xs text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">{copy.colFile}</th>
                          <th className="px-3 py-2 font-medium"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {queue.map((item) => (
                          <tr key={item.id} className={selectedQueueItem?.id === item.id ? "bg-blue-50/50" : undefined}>
                            <td className="min-w-56 px-3 py-2 align-top">
                              <button type="button" onClick={() => setSelectedQueueId(item.id)} className="flex max-w-full items-start gap-2 text-left text-slate-900 hover:text-blue-700">
                                <FiFileText className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                                <span className="min-w-0">
                                  <span className="block truncate font-medium">{item.file.name}</span>
                                  <span className="mt-1 block"><QueueStatusBadge status={item.uploadStatus} copy={copy} /></span>
                                  {item.resultMessage ? <span className="mt-1 block text-xs text-slate-500">{item.resultMessage}</span> : null}
                                </span>
                              </button>
                            </td>
                            <td className="px-3 py-2 align-top">
                              <div className="flex justify-end gap-1.5">
                                {item.uploadStatus === "error" ? (
                                  <button type="button" title={copy.retry} onClick={() => void handleRetry(item)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-blue-700 hover:bg-blue-50">
                                    <FiRefreshCw className="h-4 w-4" aria-hidden="true" />
                                  </button>
                                ) : null}
                                <button type="button" title={copy.preview} onClick={() => openPreview(item.id)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-blue-700 hover:bg-blue-50" aria-label={copy.preview}>
                                  <FiEye className="h-4 w-4" aria-hidden="true" />
                                </button>
                                <button type="button" title={copy.remove} onClick={() => removeQueueItem(item.id)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-rose-700 hover:bg-rose-50">
                                  <FiTrash2 className="h-4 w-4" aria-hidden="true" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="flex justify-end pt-1">
                  <Button type="button" onClick={() => void handleUploadAll()} disabled={uploading}>
                    <FiUploadCloud className="h-4 w-4" aria-hidden="true" />
                    {uploading ? copy.uploading : copy.upload}
                  </Button>
                </div>
              </>
            ) : (
              <div className="rounded-xl bg-white px-4 py-5 text-sm text-slate-500">{copy.dropHint}</div>
            )}
          </div>
          </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <SectionCard
        title={copy.invoicesTitle}
        description={copy.invoicesDescription}
        headerAside={!canImport && apartmentOptions.length > 1 ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <span className="font-medium">{copy.apartment}</span>
              <select
                value={selectedInvoiceApartmentId}
                onChange={(event) => setSelectedInvoiceApartmentId(event.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                {apartmentOptions.map((apartment) => (
                  <option key={apartment.id} value={apartment.id}>{apartment.label}</option>
                ))}
              </select>
            </label>
          </div>
        ) : undefined}
      >
        {invoiceRows.length ? (
          <>
            <div className="grid gap-2 md:hidden">{invoiceMobileRows}</div>
            <div className="hidden md:block">
              <DataTable
                columns={
                  canImport
                    ? [copy.colInvoice, copy.colApartment, copy.colResident, copy.colAmount, copy.colPeriod, copy.colStatus, copy.colFile]
                    : [copy.colInvoice, copy.colApartment, copy.colResident, copy.colAmount, copy.colPeriod, copy.colFile]
                }
                rows={invoiceRows}
              />
            </div>
          </>
        ) : (
          <div className="rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-500">{copy.emptyInvoices}</div>
        )}
      </SectionCard>

      {canImport ? (
        <SectionCard title={copy.historyTitle} description={copy.historyDescription}>
          {uploadHistoryError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-5 text-sm text-rose-700">
              {copy.loadFailed}{uploadHistoryError}
            </div>
          ) : historyRows.length ? (
            <DataTable columns={[copy.colInvoice, copy.colFile, copy.colSource, copy.colDate, copy.colStatus]} rows={historyRows} pageSize={25} />
          ) : (
            <div className="rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-500">{copy.emptyHistory}</div>
          )}
        </SectionCard>
      ) : null}
    </div>
  );
}
