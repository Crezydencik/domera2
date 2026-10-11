"use client";

import { useState } from "react";
import { ChevronDown, Mail, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { removeNotification } from "@/shared/api/notifications";
import { useNotifications } from "@/shared/hooks/use-notifications";
import type { NotificationItem } from "@/shared/lib/data";

function formatLetterTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function NotificationsMailbox({ initialLetters }: { initialLetters: NotificationItem[] }) {
  const [letters, setLetters] = useState(initialLetters);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [letterPendingDeletion, setLetterPendingDeletion] = useState<NotificationItem | null>(null);
  const notifications = useNotifications();

  async function deleteLetter() {
    const letter = letterPendingDeletion;
    if (!letter) return;
    setDeletingId(letter.id);
    try {
      await removeNotification(letter.id);
      setLetters((current) => current.filter((item) => item.id !== letter.id));
      setLetterPendingDeletion(null);
      notifications.success("Письмо удалено.");
    } catch (error) {
      notifications.error(error instanceof Error ? error.message : "Не удалось удалить письмо.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="w-full">
      {letters.length ? <div className="divide-y divide-slate-100 border-y border-slate-100">{letters.map((letter) => {
          const sentAt = formatLetterTime(letter.createdAt);
          return <details key={letter.id} className="group bg-white">
            <summary className="flex cursor-pointer list-none items-center gap-3 py-3 text-left hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
              <span className="w-28 shrink-0 truncate text-sm font-semibold text-slate-900 sm:w-44">{letter.companyName || "Управляющая компания"}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-slate-700"><strong className="font-semibold text-slate-900">{letter.title}</strong><span className="mx-1 text-slate-400">—</span><span className="text-slate-500">{letter.description}</span></span>
              {sentAt ? <time className="hidden shrink-0 text-xs text-slate-500 sm:block" dateTime={letter.createdAt}>{sentAt}</time> : null}
              <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setLetterPendingDeletion(letter); }} disabled={deletingId === letter.id} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Удалить письмо" title="Удалить письмо"><Trash2 className="h-4 w-4" /></button>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="border-t border-slate-100 bg-slate-50 py-4 text-sm leading-6 text-slate-700"><div className="mb-3 flex items-center justify-between gap-3"><span className="font-medium text-slate-900">{letter.companyName || "Управляющая компания"}</span>{sentAt ? <time className="text-xs text-slate-500 sm:hidden" dateTime={letter.createdAt}>{sentAt}</time> : null}</div><div className="whitespace-pre-wrap">{letter.description}</div></div>
          </details>;
      })}</div> : <div className="flex min-h-40 flex-col items-center justify-center gap-3 px-6 py-10 text-center text-slate-500"><Mail className="h-9 w-9 text-slate-300" aria-hidden="true" /><p className="text-sm">Писем пока нет.</p></div>}
      <Modal open={Boolean(letterPendingDeletion)} onClose={() => { if (!deletingId) setLetterPendingDeletion(null); }} title="Удалить письмо?" size="sm" footer={<div className="flex justify-end gap-3"><button type="button" onClick={() => setLetterPendingDeletion(null)} disabled={Boolean(deletingId)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Отмена</button><button type="button" onClick={() => void deleteLetter()} disabled={Boolean(deletingId)} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50">{deletingId ? "Удаляем…" : "Удалить"}</button></div>}>
        <p className="text-sm leading-6 text-slate-600">Письмо будет удалено из вашей почты. Это действие нельзя отменить.</p>
      </Modal>
    </div>
  );
}
