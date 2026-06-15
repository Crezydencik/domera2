"use client";

import { InvoicePdfViewerButton } from "@/components/invoice-pdf-viewer-button";

function formatInvoicePeriod(period: string | undefined, fallbackDate: string | undefined, locale: string) {
  const periodMatch = /^(\d{4})-(\d{1,2})$/.exec(period ?? "");
  if (periodMatch) {
    const year = Number(periodMatch[1]);
    const month = Number(periodMatch[2]);
    if (Number.isFinite(year) && Number.isFinite(month) && month >= 1 && month <= 12) {
      const label = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(new Date(year, month - 1, 1));
      return label.charAt(0).toUpperCase() + label.slice(1);
    }
  }

  const date = new Date(fallbackDate ?? "");
  if (!Number.isNaN(date.getTime())) {
    const label = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(date);
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  return period || fallbackDate || "-";
}

export function InvoiceMobileRow({
  id,
  period,
  fallbackDate,
  amount,
  pdfUrl,
  fileName,
  fallbackTitle,
  locale,
  viewLabel,
  closeLabel,
  loadingLabel,
  errorLabel,
}: {
  id: string;
  period?: string;
  fallbackDate?: string;
  amount: string;
  pdfUrl?: string;
  fileName?: string;
  fallbackTitle: string;
  locale: string;
  viewLabel: string;
  closeLabel: string;
  loadingLabel: string;
  errorLabel: string;
}) {
  const title = fileName?.trim() || fallbackTitle;

  return (
    <article className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3" key={id}>
      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
        {formatInvoicePeriod(period, fallbackDate, locale)}
      </p>
      <p className="shrink-0 text-sm font-semibold text-slate-900">{amount}</p>
      {pdfUrl ? (
        <InvoicePdfViewerButton
          href={pdfUrl}
          label={viewLabel}
          title={title}
          closeLabel={closeLabel}
          loadingLabel={loadingLabel}
          errorLabel={errorLabel}
        />
      ) : (
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center text-xs text-slate-400">-</span>
      )}
    </article>
  );
}
