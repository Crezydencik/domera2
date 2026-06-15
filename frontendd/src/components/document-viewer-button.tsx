"use client";

import { useEffect, useMemo, useState } from "react";
import { FiDownload, FiEye, FiFileText, FiLoader } from "react-icons/fi";

type DocumentViewerButtonProps = {
  href: string;
  fileName: string;
  title: string;
  mimeType?: string;
};

function canPreview(mimeType: string, fileName: string) {
  const normalizedMime = mimeType.toLowerCase();
  const normalizedName = fileName.toLowerCase();

  return (
    normalizedMime === "application/pdf" ||
    normalizedMime.startsWith("image/") ||
    normalizedName.endsWith(".pdf") ||
    normalizedName.endsWith(".png") ||
    normalizedName.endsWith(".jpg") ||
    normalizedName.endsWith(".jpeg")
  );
}

export function DocumentViewerButton({ href, fileName, title, mimeType = "" }: DocumentViewerButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const previewable = useMemo(() => canPreview(mimeType, fileName), [fileName, mimeType]);

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  function close() {
    setOpen(false);
    setError("");
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      setObjectUrl(null);
    }
  }

  async function openViewer() {
    setOpen(true);
    setLoading(true);
    setError("");

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
        throw new Error(`Document load failed (${response.status})`);
      }

      const blob = await response.blob();
      setObjectUrl(URL.createObjectURL(blob));
    } catch {
      setError("Не удалось открыть документ.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void openViewer()}
        disabled={!href || loading}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        title="Открыть"
        aria-label="Открыть документ"
      >
        {loading ? <FiLoader className="h-4 w-4 animate-spin" /> : <FiEye className="h-4 w-4" />}
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
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-slate-900">{title}</h3>
                <p className="mt-0.5 truncate text-xs text-slate-500">{fileName}</p>
              </div>
              <button
                type="button"
                onClick={close}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                aria-label="Закрыть"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="min-h-0 flex-1 bg-slate-100">
              {loading ? (
                <div className="flex h-full items-center justify-center text-sm font-medium text-slate-600">Загружаем документ...</div>
              ) : error ? (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm font-medium text-rose-700">{error}</div>
              ) : objectUrl && previewable ? (
                <iframe src={objectUrl} title={title} className="h-full w-full border-0 bg-white" />
              ) : objectUrl ? (
                <div className="flex h-full items-center justify-center p-6">
                  <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
                    <FiFileText className="mx-auto h-10 w-10 text-slate-400" />
                    <p className="mt-3 text-sm font-semibold text-slate-900">Предпросмотр недоступен для этого формата.</p>
                    <p className="mt-1 text-sm text-slate-500">Скачайте файл, чтобы открыть его на устройстве.</p>
                    <a
                      href={objectUrl}
                      download={fileName}
                      className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
                    >
                      <FiDownload className="h-4 w-4" />
                      Скачать документ
                    </a>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
