"use client";

import { useEffect, useRef, useState } from "react";
import { FiDownload, FiFileText, FiLock, FiPlus, FiTrash2, FiUploadCloud } from "react-icons/fi";
import { DocumentViewerButton } from "@/components/document-viewer-button";
import { AlertModal } from "@/components/ui/alert-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalShell } from "@/components/ui/modal-shell";
import { deleteDocument, getDocuments, uploadDocument, type DocumentRecord, type DocumentScope } from "@/shared/api/documents";
import { useNotifications } from "@/shared/hooks/use-notifications";
import type { DashboardRole } from "@/shared/role-ui";
import { useTranslations } from "next-intl";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api";

function formatBytes(size: number) {
  if (!size) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let index = 0;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function buildDownloadHref(item: DocumentRecord) {
  if (!item.downloadUrl) return "";
    if (item.downloadUrl.startsWith("http://") || item.downloadUrl.startsWith("https://")) {
    return item.downloadUrl;
  }

  return `${apiBaseUrl}${item.downloadUrl}`;
}

export function ApartmentDocumentsBlock({
  apartmentId,
  apartmentLabel,
  role,
  userId,
}: {
  apartmentId: string;
  apartmentLabel: string;
  role: DashboardRole;
  userId?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const notifications = useNotifications();
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState<DocumentScope>("apartmentResidents");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DocumentRecord | null>(null);

  const canCreatePrivate = role !== "managementCompany";
  const t = useTranslations("documents");
  const blockT = useTranslations("documents.apartmentBlock");

  function resetCreateForm() {
    setError("");
    setTitle("");
    setSelectedFile(null);
    setScope("apartmentResidents");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function openCreateModal() {
    resetCreateForm();
    setIsCreateOpen(true);
  }

  function closeCreateModal() {
    resetCreateForm();
    setIsCreateOpen(false);
  }

  useEffect(() => {
    let mounted = true;

    const loadDocuments = () => {
      setIsLoading(true);
      getDocuments({ apartmentId })
        .then((response) => {
          if (mounted) setDocuments(response.items ?? []);
        })
        .catch((loadError) => {
          if (mounted) setError(loadError instanceof Error ? loadError.message : t("alert.loadError"));
        })
        .finally(() => {
          if (mounted) setIsLoading(false);
        });
    };

    const handleDocumentsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ apartmentId?: string }>).detail;
      if (!detail?.apartmentId || detail.apartmentId === apartmentId) {
        loadDocuments();
      }
    };

    loadDocuments();
    window.addEventListener("apartment-documents-updated", handleDocumentsUpdated);

    return () => {
      mounted = false;
      window.removeEventListener("apartment-documents-updated", handleDocumentsUpdated);
    };
  }, [apartmentId]);

  async function handleUpload() {
    setError("");

    if (!selectedFile) {
      setError(t("fields.chooseFile"));
      return;
    }

    setIsSaving(true);
    try {
      const response = await uploadDocument({
        title: title.trim() || selectedFile.name.replace(/\.[^.]+$/, ""),
        scope,
        apartmentId,
        file: selectedFile,
      });

      setDocuments((current) => [response.item, ...current]);
      closeCreateModal();
      notifications.success(blockT("uploadSuccess"));
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : blockT("uploadFailed");
      setError(message);
      notifications.error(message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(documentId: string) {
    setError("");

    try {
      await deleteDocument(documentId);
      setDocuments((current) => current.filter((item) => item.id !== documentId));
      notifications.success(blockT("deleteSuccess"));
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : blockT("deleteFailed");
      setError(message);
      notifications.error(message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-950">{blockT("blockTitle")}</p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          <FiPlus className="h-4 w-4" />
          {t("actions.addDocument")}
        </button>
      </div>

      <ModalShell
        open={isCreateOpen}
        onClose={closeCreateModal}
        title={blockT("attachTitle")}
      >
        <div className="space-y-4">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("fields.title")}
          />

          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => setScope("apartmentResidents")}
              className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                scope === "apartmentResidents" ? "border-blue-500 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span className="block font-medium">{blockT("apartmentResidentsScope")}</span>
            </button>
            {canCreatePrivate ? (
              <button
                type="button"
                onClick={() => setScope("privateApartment")}
                className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                  scope === "privateApartment" ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="block font-medium">{blockT("privateScope")}</span>
              </button>
            ) : null}
          </div>

          <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition hover:border-blue-400 hover:bg-blue-50">
            <FiFileText className="h-6 w-6 text-slate-500" />
            <span className="mt-3 text-sm font-semibold text-slate-900">
              {selectedFile ? selectedFile.name : blockT("selectFile")}
            </span>
            <span className="mt-1 text-xs text-slate-500">
              {selectedFile ? formatBytes(selectedFile.size) : t("fields.fileTypes")}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              className="sr-only"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            />
          </label>

          {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

          <Button
            type="button"
            onClick={() => void handleUpload()}
            disabled={isSaving}
            className="w-full rounded-xl font-semibold"
          >
            <FiUploadCloud className="h-4 w-4" />
            {isSaving ? blockT("attaching") : blockT("attachDocument")}
          </Button>
        </div>
      </ModalShell>

      <div className="min-w-0">
          {isLoading ? (
            <div className="rounded-lg bg-slate-50 px-4 py-6 text-sm text-slate-500">{blockT("loading")}</div>
          ) : documents.length ? (
            <div className="grid gap-3">
              {documents.map((item) => {
                const href = buildDownloadHref(item);
                const isPrivate = item.scope === "privateApartment";

                return (
                  <article key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                            {isPrivate ? <FiLock className="h-3.5 w-3.5" /> : <FiFileText className="h-3.5 w-3.5" />}
                            {isPrivate ? blockT("privateDocument") : blockT("apartmentDocument")}
                          </span>
                        </div>
                        <p className="mt-2 truncate text-sm font-semibold text-slate-950">{item.title}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {item.fileName} · {formatBytes(item.size)} · {new Date(item.uploadedAt).toLocaleDateString("ru-RU")}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <DocumentViewerButton
                          href={href}
                          fileName={item.fileName}
                          title={item.title}
                          mimeType={item.mimeType}
                        />
                        {href ? (
                          <a
                            href={href}
                            download={item.fileName}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100"
                            title={t("actions.download")}
                          >
                            <FiDownload className="h-4 w-4" />
                          </a>
                        ) : null}
                        {role === "managementCompany" || item.ownerUserId === userId ? (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(item)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-100 bg-white text-red-600 transition hover:bg-red-50"
                            title={t("actions.delete")}
                          >
                            <FiTrash2 className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
              <FiFileText className="mx-auto h-7 w-7 text-slate-400" />
              <p className="mt-2 text-sm font-semibold text-slate-800">{blockT("emptyTitle")}</p>
              <p className="mt-1 text-xs text-slate-500">{blockT("emptyDescription")}</p>
            </div>
          )}
      </div>
      <AlertModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title={blockT("deleteTitle")}
        variant="warning"
        confirmLabel={t("actions.delete")}
        cancelLabel={t("actions.cancel")}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await handleDelete(deleteTarget.id);
          setDeleteTarget(null);
        }}
      >
        {deleteTarget ? blockT("deleteDescription", { title: deleteTarget.title }) : ""}
      </AlertModal>
    </div>
  );
}
