"use client";

import { useEffect, useState } from "react";
import { FiLoader } from "react-icons/fi";

type InvoicePublicViewerProps = {
  token: string;
};

export function InvoicePublicViewer({ token }: InvoicePublicViewerProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const pdfPath = `/api/invoices/public/${encodeURIComponent(token)}/pdf?raw=1`;

  useEffect(() => {
    let cancelled = false;
    let nextObjectUrl: string | null = null;

    async function loadInvoice() {
      setLoading(true);
      setError(false);

      try {
        const response = await fetch(pdfPath, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Invoice PDF request failed (${response.status})`);
        }

        const blob = await response.blob();
        nextObjectUrl = URL.createObjectURL(blob);

        if (!cancelled) {
          setObjectUrl(nextObjectUrl);
        }
      } catch {
        if (!cancelled) {
          setError(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadInvoice();

    return () => {
      cancelled = true;
      if (nextObjectUrl) {
        URL.revokeObjectURL(nextObjectUrl);
      }
    };
  }, [pdfPath]);

  useEffect(() => {
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [objectUrl]);

  return (
    <main className="flex min-h-screen flex-col bg-slate-100">
      <section className="min-h-0 flex-1">
        {loading ? (
          <div className="flex h-screen items-center justify-center gap-3 text-sm font-medium text-slate-600">
            <FiLoader className="h-5 w-5 animate-spin" aria-hidden="true" />
            Opening invoice...
          </div>
        ) : error ? (
          <div className="flex h-screen items-center justify-center px-6 text-center text-sm font-medium text-rose-700">
            Could not open this invoice. The link may have expired.
          </div>
        ) : objectUrl ? (
          <iframe
            src={objectUrl}
            title="Invoice"
            className="h-screen w-full border-0 bg-white"
          />
        ) : null}
      </section>
    </main>
  );
}
