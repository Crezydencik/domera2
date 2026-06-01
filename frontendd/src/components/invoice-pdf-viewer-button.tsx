"use client";

import { useEffect, useState } from "react";
import { FiEye, FiLoader } from "react-icons/fi";

type InvoicePdfViewerButtonProps = {
  href: string;
  label: string;
  title: string;
  closeLabel: string;
  loadingLabel: string;
  errorLabel: string;
};

export function InvoicePdfViewerButton({
  href,
  label,
  title,
  closeLabel,
  loadingLabel,
  errorLabel,
}: InvoicePdfViewerButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  function close() {
    setOpen(false);
    setError(null);
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      setObjectUrl(null);
    }
  }

  async function openViewer() {
    setOpen(true);
    setLoading(true);
    setError(null);

    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      setObjectUrl(null);
    }

    try {
      const response = await fetch(href, {
        credentials: "include",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Failed to load invoice PDF (${response.status})`);
      }

      const blob = await response.blob();
      setObjectUrl(URL.createObjectURL(blob));
    } catch {
      setError(errorLabel);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void openViewer()}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={loading}
        aria-label={label}
        title={label}
      >
        {loading ? (
          <FiLoader className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <FiEye className="h-4 w-4" aria-hidden="true" />
        )}
        <span className="sr-only">{loading ? loadingLabel : label}</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-5" onClick={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="relative flex h-[min(92dvh,920px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3">
              <h3 className="min-w-0 truncate text-sm font-semibold text-slate-900">{title}</h3>
              <button
                type="button"
                onClick={close}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                aria-label={closeLabel}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="min-h-0 flex-1 bg-slate-100">
              {loading ? (
                <div className="flex h-full items-center justify-center text-sm font-medium text-slate-600">
                  {loadingLabel}
                </div>
              ) : error ? (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm font-medium text-rose-700">
                  {error}
                </div>
              ) : objectUrl ? (
                <iframe
                  src={objectUrl}
                  title={title}
                  className="h-full w-full border-0 bg-white"
                />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
