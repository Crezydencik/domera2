"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Archive, CheckCircle2, Clock, Inbox, Mail, RefreshCw, Send, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  addSupportFeedbackMessage,
  completeSupportFeedback,
  listSupportFeedbackInbox,
  SUPPORT_CHANGED_EVENT,
  type SupportFeedbackItem,
} from "@/shared/api/support";

type InboxTab = "active" | "archived";

function formatDate(value: string | null) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";

  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function priorityClass(priority: SupportFeedbackItem["priority"]) {
  if (priority === "high") return "border-rose-200 bg-rose-50 text-rose-700";
  if (priority === "low") return "border-slate-200 bg-slate-50 text-slate-500";
  return "border-sky-200 bg-sky-50 text-sky-700";
}

function priorityLabel(priority: SupportFeedbackItem["priority"]) {
  if (priority === "high") return "Urgent";
  if (priority === "low") return "Low";
  return "Normal";
}

function senderLabel(item: SupportFeedbackItem) {
  return item.userEmail || item.userId || "Unknown sender";
}

export function SupportInbox() {
  const [items, setItems] = useState<SupportFeedbackItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<InboxTab>("active");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [replying, setReplying] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? items[0] ?? null,
    [items, selectedId],
  );

  const loadInbox = useCallback(async (nextTab = tab, options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await listSupportFeedbackInbox(nextTab);
      const nextItems = response.items ?? [];
      setItems(nextItems);
      setSelectedId((current) => {
        if (current && nextItems.some((item) => item.id === current)) return current;
        return nextItems[0]?.id ?? null;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load support inbox.");
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [tab]);

  useEffect(() => {
    void loadInbox(tab);
  }, [loadInbox, tab]);

  useEffect(() => {
    const refreshSilently = () => void loadInbox(tab, { silent: true });
    const intervalId = window.setInterval(refreshSilently, 8000);

    window.addEventListener("focus", refreshSilently);
    window.addEventListener(SUPPORT_CHANGED_EVENT, refreshSilently);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshSilently);
      window.removeEventListener(SUPPORT_CHANGED_EVENT, refreshSilently);
    };
  }, [loadInbox, tab]);

  async function handleReply() {
    if (!selectedItem || !reply.trim()) return;

    setReplying(true);
    setError(null);

    try {
      const updated = await addSupportFeedbackMessage(selectedItem.id, reply.trim());
      setItems((current) => current.map((item) => (item.id === selectedItem.id ? updated : item)));
      setReply("");
    } catch (replyError) {
      setError(replyError instanceof Error ? replyError.message : "Failed to send reply.");
    } finally {
      setReplying(false);
    }
  }

  async function handleComplete() {
    if (!selectedItem) return;

    setCompleting(true);
    setError(null);

    try {
      await completeSupportFeedback(selectedItem.id);
      const remaining = items.filter((item) => item.id !== selectedItem.id);
      setItems(remaining);
      setSelectedId(remaining[0]?.id ?? null);
      setReply("");
    } catch (completeError) {
      setError(completeError instanceof Error ? completeError.message : "Failed to complete request.");
    } finally {
      setCompleting(false);
    }
  }

  const isArchive = tab === "archived";

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm shadow-slate-950/[0.03]">
      <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700 ring-1 ring-sky-100">
            <Inbox className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Support inbox</h2>
            <p className="text-sm text-slate-500">{items.length} {isArchive ? "archived" : "active"} requests</p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
            {(["active", "archived"] as InboxTab[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setTab(item);
                  setSelectedId(null);
                  setReply("");
                }}
                className={`min-h-9 rounded-md px-3 text-sm font-semibold transition ${
                  tab === item ? "bg-white text-sky-700 shadow-sm" : "text-slate-500 hover:text-slate-950"
                }`}
              >
                {item === "active" ? "Active" : "Archive"}
              </button>
            ))}
          </div>
          <Button type="button" variant="secondary" onClick={() => void loadInbox()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <div className="m-5 flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="grid min-h-[680px] lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="border-b border-slate-100 bg-slate-50/70 lg:border-b-0 lg:border-r">
          {loading && items.length === 0 ? (
            <div className="p-5 text-sm text-slate-500">Loading requests...</div>
          ) : items.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center px-5 text-center">
              {isArchive ? (
                <Archive className="h-9 w-9 text-slate-300" aria-hidden="true" />
              ) : (
                <Mail className="h-9 w-9 text-slate-300" aria-hidden="true" />
              )}
              <p className="mt-3 text-sm font-semibold text-slate-700">{isArchive ? "Archive is empty" : "No active requests"}</p>
              <p className="mt-1 text-sm text-slate-500">Support requests from management companies will appear here.</p>
            </div>
          ) : (
            <div className="max-h-[760px] overflow-y-auto p-3">
              {items.map((item) => {
                const active = selectedItem?.id === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(item.id);
                      setReply("");
                    }}
                    className={`mb-2 block w-full rounded-lg border px-4 py-3 text-left transition ${
                      active
                        ? "border-sky-200 bg-white shadow-sm shadow-sky-950/[0.04]"
                        : "border-transparent bg-white/70 hover:border-slate-200 hover:bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">{item.subject || "Support request"}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">{senderLabel(item)}</p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${priorityClass(item.priority)}`}>
                        {priorityLabel(item.priority)}
                      </span>
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm leading-5 text-slate-600">{item.messages?.at(-1)?.body || item.message}</p>
                    <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                      {formatDate(item.updatedAt ?? item.createdAt)}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="min-w-0 bg-white">
          {selectedItem ? (
            <article className="flex min-h-full flex-col">
              <div className="border-b border-slate-100 px-6 py-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Support request</p>
                    <h3 className="mt-2 break-words text-2xl font-semibold text-slate-950">{selectedItem.subject || "Support request"}</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold ${priorityClass(selectedItem.priority)}`}>
                      {priorityLabel(selectedItem.priority)}
                    </span>
                    {isArchive ? (
                      <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                        <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                        Archived
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 border-b border-slate-100 bg-slate-50/70 px-6 py-4 sm:grid-cols-2">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-500 ring-1 ring-slate-200">
                    <UserRound className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">From</p>
                    <p className="truncate text-sm font-semibold text-slate-800">{senderLabel(selectedItem)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-500 ring-1 ring-slate-200">
                    <Clock className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Updated</p>
                    <p className="truncate text-sm font-semibold text-slate-800">{formatDate(selectedItem.updatedAt ?? selectedItem.createdAt)}</p>
                  </div>
                </div>
              </div>

              <div className="flex-1 space-y-4 bg-slate-50/70 px-6 py-6">
                {(selectedItem.messages ?? []).map((message) => {
                  const isAdmin = message.author === "admin";

                  return (
                    <div key={message.id} className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                          isAdmin
                            ? "rounded-br-md bg-sky-600 text-white"
                            : "rounded-bl-md border border-slate-200 bg-white text-slate-700"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{message.body}</p>
                        <p className={`mt-2 text-xs font-medium ${isAdmin ? "text-sky-100" : "text-slate-400"}`}>
                          {isAdmin ? "Admin" : senderLabel(selectedItem)} · {formatDate(message.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-slate-100 bg-white px-6 py-5">
                {isArchive ? (
                  <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                    <Archive className="h-4 w-4" aria-hidden="true" />
                    This request is completed and archived.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <textarea
                      value={reply}
                      onChange={(event) => setReply(event.target.value)}
                      rows={4}
                      maxLength={3000}
                      placeholder="Write admin reply..."
                      className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm shadow-slate-950/[0.02] outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    />
                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                      <Button type="button" variant="secondary" onClick={() => void handleComplete()} disabled={completing}>
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        {completing ? "Completing..." : "Complete"}
                      </Button>
                      <Button type="button" onClick={() => void handleReply()} disabled={replying || !reply.trim()}>
                        <Send className="h-4 w-4" aria-hidden="true" />
                        {replying ? "Sending..." : "Send reply"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </article>
          ) : null}
        </div>
      </div>
    </section>
  );
}
