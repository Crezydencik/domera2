"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Archive, ChevronDown, Clock, MessageCircle, MessageSquare, Plus, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  addSupportFeedbackMessage,
  createSupportFeedback,
  listMySupportFeedback,
  SUPPORT_CHANGED_EVENT,
  type SupportFeedbackItem,
  type SupportFeedbackPriority,
} from "@/shared/api/support";

const priorityOptions: Array<{ value: SupportFeedbackPriority; label: string }> = [
  { value: "normal", label: "Normal" },
  { value: "high", label: "Urgent" },
  { value: "low", label: "Low" },
];

function formatDate(value: string | null) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";

  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function priorityClass(priority: SupportFeedbackPriority) {
  if (priority === "high") return "border-rose-200 bg-rose-50 text-rose-700";
  if (priority === "low") return "border-slate-200 bg-slate-50 text-slate-500";
  return "border-sky-200 bg-sky-50 text-sky-700";
}

function priorityLabel(priority: SupportFeedbackPriority) {
  if (priority === "high") return "Urgent";
  if (priority === "low") return "Low";
  return "Normal";
}

function statusLabel(status: string) {
  return status === "archived" ? "Completed" : "Open";
}

function lastMessageText(item: SupportFeedbackItem) {
  return item.messages?.at(-1)?.body || item.message || "No message";
}

function buildSubject(message: string) {
  const normalized = message.trim().replace(/\s+/g, " ");
  if (normalized.length <= 88) return normalized;
  return `${normalized.slice(0, 85)}...`;
}

export function SupportFeedbackForm() {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<SupportFeedbackPriority>("normal");
  const [items, setItems] = useState<SupportFeedbackItem[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyById, setReplyById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const openItems = useMemo(() => items.filter((item) => item.status !== "archived"), [items]);
  const archivedItems = useMemo(() => items.filter((item) => item.status === "archived"), [items]);

  const loadRequests = useCallback(async (options?: { clearFeedback?: boolean; silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    if (options?.clearFeedback !== false) {
      setFeedback(null);
    }

    try {
      const response = await listMySupportFeedback();
      setItems(response.items ?? []);
    } catch (error) {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Failed to load support requests." });
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  useEffect(() => {
    const refreshSilently = () => void loadRequests({ clearFeedback: false, silent: true });
    const intervalId = window.setInterval(refreshSilently, 8000);

    window.addEventListener("focus", refreshSilently);
    window.addEventListener(SUPPORT_CHANGED_EVENT, refreshSilently);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshSilently);
      window.removeEventListener(SUPPORT_CHANGED_EVENT, refreshSilently);
    };
  }, [loadRequests]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    const normalizedMessage = message.trim();
    const normalizedSubject = subject.trim() || buildSubject(normalizedMessage);

    if (!normalizedMessage || !normalizedSubject) {
      setFeedback({ tone: "error", text: "Please fill in subject and message." });
      return;
    }

    setSubmitting(true);
    try {
      const response = await createSupportFeedback({
        subject: normalizedSubject,
        message: normalizedMessage,
        priority,
      });
      setSubject("");
      setMessage("");
      setPriority("normal");
      setExpandedId(response.id);
      await loadRequests({ clearFeedback: false });
      setFeedback({ tone: "success", text: "Support request created." });
    } catch (error) {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Failed to create support request." });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReply(feedbackId: string) {
    const reply = (replyById[feedbackId] ?? "").trim();
    if (!reply) return;

    setReplyingId(feedbackId);
    setFeedback(null);

    try {
      const updated = await addSupportFeedbackMessage(feedbackId, reply);
      setItems((current) => current.map((item) => (item.id === feedbackId ? updated : item)));
      setReplyById((current) => ({ ...current, [feedbackId]: "" }));
    } catch (error) {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Failed to send message." });
    } finally {
      setReplyingId(null);
    }
  }

  function renderRequest(item: SupportFeedbackItem) {
    const expanded = expandedId === item.id;
    const archived = item.status === "archived";
    const messageCount = item.messages?.length ?? 0;

    return (
      <article
        key={item.id}
        className={`overflow-hidden rounded-lg border bg-white transition ${
          expanded
            ? "border-sky-200 shadow-sm shadow-sky-950/[0.04]"
            : "border-slate-200 hover:border-slate-300 hover:shadow-sm hover:shadow-slate-950/[0.03]"
        }`}
      >
        <button
          type="button"
          onClick={() => setExpandedId(expanded ? null : item.id)}
          className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3 text-left transition hover:bg-slate-50/70"
        >
          <div className="min-w-0 space-y-1.5">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h4 className="min-w-0 truncate text-sm font-semibold text-slate-950">{item.subject || "Support request"}</h4>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-5 ${priorityClass(item.priority)}`}>
                {priorityLabel(item.priority)}
              </span>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-5 ${archived ? "border-slate-200 bg-slate-100 text-slate-500" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                {statusLabel(item.status)}
              </span>
            </div>
            <p className="truncate text-sm leading-5 text-slate-600">{lastMessageText(item)}</p>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {formatDate(item.updatedAt ?? item.createdAt)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                {messageCount} {messageCount === 1 ? "message" : "messages"}
              </span>
            </p>
          </div>
          <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white hover:text-slate-700">
            <ChevronDown className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
          </span>
        </button>

        {expanded ? (
          <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-4">
            <div className="space-y-3">
              {(item.messages ?? []).map((chatMessage) => {
                const isAdmin = chatMessage.author === "admin";

                return (
                  <div key={chatMessage.id} className={`flex ${isAdmin ? "justify-start" : "justify-end"}`}>
                    <div
                      className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-6 shadow-sm ${
                        isAdmin
                          ? "rounded-bl-md border border-slate-200 bg-white text-slate-700"
                          : "rounded-br-md bg-sky-600 text-white"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{chatMessage.body}</p>
                      <p className={`mt-2 text-xs font-medium ${isAdmin ? "text-slate-400" : "text-sky-100"}`}>
                        {isAdmin ? "Support" : "You"} - {formatDate(chatMessage.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {archived ? (
              <div className="mt-5 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                <Archive className="h-4 w-4" aria-hidden="true" />
                This request is completed and archived.
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
                <textarea
                  value={replyById[item.id] ?? ""}
                  onChange={(event) => setReplyById((current) => ({ ...current, [item.id]: event.target.value }))}
                  rows={3}
                  maxLength={3000}
                  placeholder="Write a reply..."
                  className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-200"
                />
                <div className="mt-3 flex justify-end">
                  <Button
                    type="button"
                    onClick={() => void handleReply(item.id)}
                    disabled={replyingId === item.id || !(replyById[item.id] ?? "").trim()}
                  >
                    <Send className="h-4 w-4" aria-hidden="true" />
                    {replyingId === item.id ? "Sending..." : "Send reply"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleCreate} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/[0.03]">
        <div className="mb-5 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700 ring-1 ring-sky-100">
            <Plus className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-base font-semibold text-slate-950">New support request</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">Create a request first. After that, continue the dialogue inside the request below.</p>
          </div>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Subject</span>
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              maxLength={120}
              placeholder="Short description"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm shadow-slate-950/[0.02] outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </label>

          <div>
            <span className="text-sm font-medium text-slate-700">Priority</span>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {priorityOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPriority(option.value)}
                  className={`min-h-10 rounded-lg border px-3 text-sm font-medium transition ${
                    priority === option.value
                      ? "border-sky-200 bg-sky-100/70 text-sky-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Message</span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={5}
              maxLength={3000}
              placeholder="Describe the question or issue"
              className="mt-1 w-full resize-y rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm shadow-slate-950/[0.02] outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
            <span className="mt-1 block text-xs text-slate-500">{message.length}/3000</span>
          </label>

          {feedback ? (
            <div className={`rounded-lg border px-3 py-2 text-sm ${feedback.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
              {feedback.text}
            </div>
          ) : null}

          <div className="flex justify-end">
            <Button type="submit" disabled={submitting || !message.trim()}>
              <Send className="h-4 w-4" aria-hidden="true" />
              {submitting ? "Creating..." : "Send request"}
            </Button>
          </div>
        </div>
      </form>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/[0.03]">
        <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700 ring-1 ring-sky-100">
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-base font-semibold text-slate-950">My requests</h3>
              <p className="text-sm text-slate-500">{openItems.length} open, {archivedItems.length} completed</p>
            </div>
          </div>
          <Button type="button" variant="secondary" className="min-h-9 px-3" onClick={() => void loadRequests()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
            Refresh
          </Button>
        </div>

        {loading && items.length === 0 ? (
          <div className="rounded-lg bg-slate-50 px-4 py-6 text-sm text-slate-500">Loading requests...</div>
        ) : items.length === 0 ? (
          <div className="rounded-lg bg-slate-50 px-4 py-6 text-sm text-slate-500">No support requests yet.</div>
        ) : (
          <div className="space-y-2.5">
            {openItems.map(renderRequest)}
            {archivedItems.length > 0 ? (
              <div className="pt-2">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Archive</p>
                <div className="space-y-2.5">{archivedItems.map(renderRequest)}</div>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
