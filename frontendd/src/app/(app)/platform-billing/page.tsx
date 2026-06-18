"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FiFileText, FiRefreshCw, FiSearch } from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { DocumentsWorkspace } from "@/app/(app)/documents/documents-workspace";
import { getAdminBuildings, getPlatformBillingInvoices, type AdminBuilding, type PlatformBillingInvoice } from "@/shared/api/buildings";
import { useNotifications } from "@/shared/hooks/use-notifications";
import type { Building } from "@/shared/lib/data";

type BillingWorkspaceTab = "invoices" | "documents";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }

  return "";
}

function amountValue(invoice: PlatformBillingInvoice) {
  const amount = Number(invoice.amount ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function formatMoney(invoice: PlatformBillingInvoice) {
  const currency = firstText(invoice.currency, "EUR").toUpperCase();
  if (currency === "EUR") return currencyFormatter.format(amountValue(invoice));
  return `${amountValue(invoice).toFixed(2)} ${currency}`;
}

function formatStableDate(date: Date) {
  if (Number.isNaN(date.getTime())) return "-";

  const pad = (part: number) => String(part).padStart(2, "0");
  return `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}.${date.getUTCFullYear()}`;
}

function formatDate(value?: unknown) {
  if (!value) return "-";

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : formatStableDate(date);
  }

  if (typeof value === "object") {
    const timestamp = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof timestamp.toDate === "function") {
      const date = timestamp.toDate();
      return formatStableDate(date);
    }

    const seconds = typeof timestamp.seconds === "number" ? timestamp.seconds : timestamp._seconds;
    if (typeof seconds === "number") {
      const date = new Date(seconds * 1000);
      return formatStableDate(date);
    }
  }

  return "-";
}

function statusClass(status?: string) {
  const normalized = firstText(status).toLowerCase();
  if (normalized === "paid") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (normalized === "overdue") return "border-rose-200 bg-rose-50 text-rose-700";
  if (normalized === "cancelled") return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function matchesQuery(invoice: PlatformBillingInvoice, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [
    invoice.invoiceNumber,
    invoice.title,
    invoice.companyName,
    invoice.companyId,
    invoice.buildingName,
    invoice.buildingAddress,
    invoice.requesterEmail,
    invoice.status,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .some((value) => value.toLowerCase().includes(normalizedQuery));
}

function toDocumentBuilding(building: AdminBuilding): Building {
  const apartments = Number(building.apartmentsCount ?? building.apartments ?? 0);
  const occupiedApartments = Number(building.occupiedApartments ?? 0);

  return {
    id: building.id,
    name: firstText(building.name, building.title, building.address, building.id),
    address: firstText(building.address, building.street, building.location),
    comment: building.comment,
    apartments: Number.isFinite(apartments) ? apartments : 0,
    occupancy: `${Number.isFinite(occupiedApartments) ? occupiedApartments : 0} / ${Number.isFinite(apartments) ? apartments : 0}`,
    status: firstText(building.status, "Healthy"),
    companyId: building.companyId,
    companyName: building.companyName,
    managedBy: building.managedBy,
    editLocked: building.editLocked,
  };
}

export default function PlatformBillingPage() {
  const notifications = useNotifications();
  const notifyError = notifications.error;
  const [activeTab, setActiveTab] = useState<BillingWorkspaceTab>("invoices");
  const [items, setItems] = useState<PlatformBillingInvoice[]>([]);
  const [documentBuildings, setDocumentBuildings] = useState<Building[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getPlatformBillingInvoices();
      setItems(response.items ?? []);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Failed to load billing invoices.");
    } finally {
      setLoading(false);
    }
  }, [notifyError]);

  const loadDocumentBuildings = useCallback(async () => {
    try {
      const response = await getAdminBuildings();
      setDocumentBuildings((response.items ?? []).map(toDocumentBuilding));
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Failed to load buildings.");
    }
  }, [notifyError]);

  useEffect(() => {
    void loadInvoices();
    void loadDocumentBuildings();
  }, [loadDocumentBuildings, loadInvoices]);

  const filteredItems = useMemo(
    () => items.filter((invoice) => matchesQuery(invoice, query)),
    [items, query],
  );
  const pendingAmount = useMemo(
    () => filteredItems
      .filter((invoice) => firstText(invoice.status).toLowerCase() !== "paid")
      .reduce((sum, invoice) => sum + amountValue(invoice), 0),
    [filteredItems],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-sky-700">
            <FiFileText className="h-4 w-4" aria-hidden="true" />
            Platform administration
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">Invoices / Documents</h2>
          <p className="mt-1 text-sm text-slate-500">Issued platform invoices for management companies.</p>
        </div>

        {activeTab === "invoices" ? (
        <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
          <label className="relative min-w-0 flex-1 lg:w-80">
            <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              placeholder="Search invoices"
            />
          </label>
          <Button type="button" variant="secondary" onClick={() => void loadInvoices()} disabled={loading}>
            <FiRefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Refresh
          </Button>
        </div>
        ) : null}
      </div>

      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setActiveTab("invoices")}
          className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
            activeTab === "invoices"
              ? "bg-sky-600 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          Счёт
          <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
            activeTab === "invoices" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
          }`}>
            {filteredItems.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("documents")}
          className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
            activeTab === "documents"
              ? "bg-sky-600 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          Документы
        </button>
      </div>

      {activeTab === "invoices" ? (
      <>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Documents</p>
          <p className="mt-1 text-xl font-semibold text-slate-950">{filteredItems.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pending amount</p>
          <p className="mt-1 text-xl font-semibold text-slate-950">{currencyFormatter.format(pendingAmount)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Source</p>
          <p className="mt-1 text-xl font-semibold text-slate-950">Platform billing</p>
        </div>
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="grid grid-cols-[minmax(180px,1fr)_minmax(170px,.8fr)_minmax(190px,1fr)_minmax(110px,.5fr)_minmax(110px,.5fr)_minmax(110px,.5fr)_minmax(110px,.5fr)] gap-4 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <span>Invoice</span>
          <span>Company</span>
          <span>Building</span>
          <span>Amount</span>
          <span>Status</span>
          <span>Invoice date</span>
          <span>Due date</span>
        </div>

        {loading ? (
          <div className="px-4 py-8 text-sm text-slate-500">Loading invoices...</div>
        ) : filteredItems.length ? (
          <div className="divide-y divide-slate-100">
            {filteredItems.map((invoice) => (
              <div
                key={invoice.id}
                className="grid grid-cols-[minmax(180px,1fr)_minmax(170px,.8fr)_minmax(190px,1fr)_minmax(110px,.5fr)_minmax(110px,.5fr)_minmax(110px,.5fr)_minmax(110px,.5fr)] gap-4 px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-950">{invoice.invoiceNumber || invoice.id}</p>
                  <p className="truncate text-xs text-slate-500">{invoice.title || invoice.type || "Invoice document"}</p>
                </div>
                <p className="min-w-0 truncate text-slate-700">{invoice.companyName || invoice.companyId || "-"}</p>
                <div className="min-w-0">
                  <p className="truncate text-slate-700">{invoice.buildingName || "-"}</p>
                  {invoice.buildingAddress ? <p className="truncate text-xs text-slate-500">{invoice.buildingAddress}</p> : null}
                </div>
                <p className="font-semibold text-slate-950">{formatMoney(invoice)}</p>
                <div>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(invoice.status)}`}>
                    {invoice.status || "pending"}
                  </span>
                </div>
                <p className="text-slate-700">{formatDate(invoice.invoiceDate || invoice.createdAt)}</p>
                <p className="text-slate-700">{formatDate(invoice.dueDate)}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 py-8 text-sm text-slate-500">No issued invoices yet.</div>
        )}
      </section>
      </>
      ) : (
        <DocumentsWorkspace
          role="platformAdmin"
          buildings={documentBuildings}
          apartments={[]}
          serverDocuments={[]}
          managementCompanyVisibilityOnly
        />
      )}
    </div>
  );
}
