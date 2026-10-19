"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, CheckCircle2, ChevronDown, Eye, Italic, Link, Pencil, Save, Send, Trash2, Underline, Users } from "lucide-react";
import { SectionCard } from "@/components/section-card";
import { Modal } from "@/components/ui/modal";
import { apiFetch } from "@/shared/api/client";
import { useNotifications } from "@/shared/hooks/use-notifications";
import type { Building } from "@/shared/lib/data";

type Props = { buildings: Building[]; apartments: Record<string, unknown>[]; company: Record<string, unknown> | null };
type Audience = "all" | "specific";
type ApartmentRecipientMode = "all" | "owners" | "residents";
type SpecificRecipientMode = "owners" | "residents" | "select";

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
function isActiveTenant(tenant: unknown) {
  if (!tenant || typeof tenant !== "object") return false;
  const record = tenant as Record<string, unknown>;
  const status = stringValue(record.status).toLowerCase();
  if (["removed", "deleted", "revoked", "inactive"].includes(status)) return false;
  return record.activated === true || Boolean(record.acceptedAt) || Boolean(record.activatedAt) || status === "active" || status === "accepted";
}
function toPlainText(value: string) { return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
const PREVIEW_ALLOWED_TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 'p', 'div', 'br', 'ul', 'ol', 'li', 'a']);
function escapePreviewText(value: string) {
  return value.replace(/&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
// Same allow-list algorithm as the backend (common/utils/mailing-html.ts): only rebuilt allowed tags
// and escaped text reach innerHTML. The old regex-strip left unclosed tags such as
// `<img src=x onerror=...` untouched.
function sanitizePreviewHtml(value: string) {
  const input = value.slice(0, 20_000);
  const tokenPattern = /<(\/)?([a-zA-Z][a-zA-Z0-9]*)\b([^<>]*)>/g;
  const open: string[] = [];
  let output = '';
  let cursor = 0;
  for (let match = tokenPattern.exec(input); match; match = tokenPattern.exec(input)) {
    output += escapePreviewText(input.slice(cursor, match.index));
    cursor = match.index + match[0].length;
    const name = match[2].toLowerCase();
    const attributes = match[3] ?? '';
    if (!PREVIEW_ALLOWED_TAGS.has(name)) continue;
    if (match[1]) {
      const index = open.lastIndexOf(name);
      if (index === -1) continue;
      while (open.length > index) output += `</${open.pop()}>`;
      continue;
    }
    if (name === 'br') { output += '<br>'; continue; }
    if (name === 'a') {
      const href = /href\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1] ?? '';
      output += /^https?:\/\//i.test(href) ? `<a href="${escapePreviewText(href)}" style="color:#2563eb;text-decoration:underline;text-underline-offset:2px;">` : '<a>';
    } else {
      const align = /text-align\s*:\s*(left|center|right|justify)/i.exec(attributes)?.[1];
      output += align && (name === 'p' || name === 'div') ? `<${name} style="text-align:${align.toLowerCase()}">` : `<${name}>`;
    }
    open.push(name);
  }
  output += escapePreviewText(input.slice(cursor));
  while (open.length) output += `</${open.pop()}>`;
  return output;
}
type MailingTemplate = { id: string; name: string; title: string; message: string; messageHtml?: string };
type MailingHistory = { id: string; title: string; message?: string; recipients: number; sent: number; failed: number; createdAt?: unknown };
type EditorFormatState = { bold: boolean; italic: boolean; underline: boolean; link: boolean; alignment: "left" | "center" | "right" | "justify" | null };

const initialEditorFormatState: EditorFormatState = { bold: false, italic: false, underline: false, link: false, alignment: null };

function formatHistoryDate(value: unknown) {
  const timestamp = value && typeof value === "object" ? value as Record<string, unknown> : null;
  const seconds = Number(timestamp?.seconds ?? timestamp?._seconds);
  const date = Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? "Дата неизвестна" : date.toLocaleString();
}

export function MailingsWorkspace({ buildings, apartments, company }: Props) {
  const t = useTranslations("mailings");
  const searchParams = useSearchParams();
  const templateMode = searchParams.get("mode") === "templates";
  const sentMode = searchParams.get("mode") === "sent";
  const toast = useNotifications();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [messageHtml, setMessageHtml] = useState("");
  const [audience, setAudience] = useState<Audience>("all");
  const [buildingIds, setBuildingIds] = useState<string[]>([]);
  const [apartmentIds, setApartmentIds] = useState<string[]>([]);
  const [apartmentRecipientModes, setApartmentRecipientModes] = useState<Record<string, ApartmentRecipientMode>>({});
  const [specificRecipientMode, setSpecificRecipientMode] = useState<SpecificRecipientMode>("select");
  const [expandedApartmentIds, setExpandedApartmentIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ recipients: number; sent: number; failed: number } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [recipientsOpen, setRecipientsOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("https://");
  const [editingLink, setEditingLink] = useState(false);
  const [signature, setSignature] = useState("");
  const [templates, setTemplates] = useState<MailingTemplate[]>([]);
  const [history, setHistory] = useState<MailingHistory[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [editorFormat, setEditorFormat] = useState<EditorFormatState>(initialEditorFormatState);
  const editorRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<Range | null>(null);
  const editingLinkRef = useRef<HTMLAnchorElement | null>(null);
  const invoiceSettings = company?.invoiceSettings && typeof company.invoiceSettings === "object" ? company.invoiceSettings as Record<string, unknown> : {};
  const companyName = stringValue(company?.companyName) || stringValue(company?.name) || "Domera";
  const mailingLanguage = invoiceSettings.language === "ru" || invoiceSettings.language === "en" || invoiceSettings.language === "lv" ? invoiceSettings.language : "lv";
  const mailingActionCopy = mailingLanguage === "ru"
    ? { label: "Открыть уведомления", footer: `Это автоматическое информационное сообщение ${companyName || "Domera"}.` }
    : mailingLanguage === "en"
      ? { label: "Open notifications", footer: `This is an automated information message from ${companyName || "Domera"}.` }
      : { label: "Atvērt paziņojumus", footer: "Šis ir automātiski sagatavots e-pasta sūtījums, lūdzam uz to neatbildēt." };
  const accentColor = /^#[0-9a-f]{6}$/i.test(stringValue(invoiceSettings.accentColor)) ? stringValue(invoiceSettings.accentColor) : "#4f46e5";
  const logoDataUrl = invoiceSettings.logoHidden === true ? "" : stringValue(invoiceSettings.logoDataUrl);
  useEffect(() => { setSignature((current) => current || `${t("signature")}\n${companyName}`); }, [companyName, t]);

  const refreshSavedItems = () => Promise.all([
    apiFetch<{ items: MailingTemplate[] }>("/emails/information-mailing/templates").then((data) => setTemplates(data.items ?? [])).catch(() => undefined),
    apiFetch<{ items: MailingHistory[] }>("/emails/information-mailing/history").then((data) => setHistory(data.items ?? [])).catch(() => undefined),
  ]);
  useEffect(() => { void refreshSavedItems(); }, []);
  const updateEditorFormat = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    const anchor = selection?.anchorNode;
    if (!editor || !anchor || !editor.contains(anchor)) {
      setEditorFormat(initialEditorFormatState);
      return;
    }
    const element = anchor.nodeType === Node.ELEMENT_NODE ? anchor as Element : anchor.parentElement;
    const alignment = ["justifyLeft", "justifyCenter", "justifyRight", "justifyFull"].find((command) => document.queryCommandState(command));
    setEditorFormat({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
      link: Boolean(element?.closest("a")),
      alignment: alignment === "justifyLeft" ? "left" : alignment === "justifyCenter" ? "center" : alignment === "justifyRight" ? "right" : alignment === "justifyFull" ? "justify" : null,
    });
  };
  const syncEditor = () => { const html = editorRef.current?.innerHTML ?? ""; setMessageHtml(html); setMessage(toPlainText(html)); updateEditorFormat(); };
  const rememberSelection = () => { const selection = window.getSelection(); if (selection?.rangeCount) selectionRef.current = selection.getRangeAt(0).cloneRange(); };
  const restoreSelection = () => { if (!selectionRef.current) return; const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(selectionRef.current); };
  const format = (command: string) => { editorRef.current?.focus(); restoreSelection(); document.execCommand(command); syncEditor(); rememberSelection(); };
  const createLink = () => {
    rememberSelection();
    const selection = window.getSelection();
    const element = selection?.anchorNode?.nodeType === Node.ELEMENT_NODE ? selection.anchorNode as Element : selection?.anchorNode?.parentElement;
    const existingLink = element?.closest("a") as HTMLAnchorElement | null;
    editingLinkRef.current = existingLink;
    setEditingLink(Boolean(existingLink));
    setLinkUrl(existingLink?.href ?? "https://");
    setLinkDialogOpen(true);
  };
  const confirmLink = () => {
    const url = linkUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      toast.warning("Укажите ссылку, начинающуюся с https:// или http://");
      return;
    }
    if (editingLinkRef.current && editorRef.current?.contains(editingLinkRef.current)) {
      editingLinkRef.current.href = url;
      editingLinkRef.current.style.color = "#2563eb";
      editingLinkRef.current.style.textDecoration = "underline";
      editingLinkRef.current.style.textUnderlineOffset = "2px";
      syncEditor();
      setEditorFormat((current) => ({ ...current, link: true }));
      setLinkDialogOpen(false);
      return;
    }
    editorRef.current?.focus();
    restoreSelection();  
    document.execCommand("createLink", false, url);
    const selection = window.getSelection();  
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    let link = (selection?.anchorNode?.nodeType === Node.ELEMENT_NODE ? selection.anchorNode as Element : selection?.anchorNode?.parentElement)?.closest("a") as HTMLAnchorElement | null;
    if (!link && range && !range.collapsed) {
      link = document.createElement("a");
      link.href = url;
      link.append(range.extractContents());
      range.insertNode(link);
      const linkRange = document.createRange();
      linkRange.selectNodeContents(link);
      selection?.removeAllRanges();
      selection?.addRange(linkRange);
    }
    if (link) {
      link.href = url;
      link.style.color = "#2563eb";
      link.style.textDecoration = "underline";
      link.style.textUnderlineOffset = "2px";
    }
    syncEditor();
    rememberSelection();
    setEditorFormat((current) => ({ ...current, link: Boolean(link) }));
    setLinkDialogOpen(false);
  };
  useEffect(() => {
    document.addEventListener("selectionchange", updateEditorFormat);
    return () => document.removeEventListener("selectionchange", updateEditorFormat);
  }, []);
  const toolbarButtonClass = (isActive: boolean) => `rounded p-2 transition-colors ${isActive ? "bg-indigo-100 text-indigo-700 shadow-sm ring-1 ring-inset ring-indigo-200" : "text-slate-700 hover:bg-slate-100"}`;
  const saveTemplate = async () => {
    const name = templateName.trim();
    if (!name || !title.trim() || !message.trim()) return toast.warning(t("needContent"));
    try { await apiFetch("/emails/information-mailing/templates", { method: "POST", body: JSON.stringify({ name, title, message, messageHtml }) }); setTemplateName(""); await refreshSavedItems(); toast.success(t("templateSaved")); } catch { toast.error(t("templateSaveFailed")); }
  };
  const loadTemplate = (template: MailingTemplate) => { setTitle(template.title); setMessage(template.message); setMessageHtml(template.messageHtml ?? template.message); if (editorRef.current) editorRef.current.innerHTML = template.messageHtml ? sanitizePreviewHtml(template.messageHtml) : escapePreviewText(template.message); };
  const deleteTemplate = async (id: string) => { try { await apiFetch(`/emails/information-mailing/templates/${encodeURIComponent(id)}`, { method: "DELETE" }); await refreshSavedItems(); } catch { toast.error(t("failed")); } };

  const availableBuildings = buildings.filter((building) => building.id);
  const apartmentOptions = useMemo(() => apartments.map((apartment) => {
    const activeTenants = Array.isArray(apartment.tenants) ? apartment.tenants.filter(isActiveTenant) as Record<string, unknown>[] : [];
    const hasOwner = apartment.ownerActivated === true && Boolean(stringValue(apartment.ownerEmail));
    const hasResidents = Boolean(stringValue(apartment.residentId) && stringValue(apartment.residentEmail)) || activeTenants.some((tenant) => Boolean(stringValue(tenant.email)));
    const tenantName = activeTenants.map((tenant) => [stringValue(tenant.firstName), stringValue(tenant.lastName)].filter(Boolean).join(" ") || stringValue(tenant.name) || stringValue(tenant.email)).filter(Boolean).join(", ");
    return {
      id: stringValue(apartment.id) || stringValue(apartment.apartmentId),
      label: `Кв. ${stringValue(apartment.number) || stringValue(apartment.apartmentNumber) || stringValue(apartment.flatNumber) || "—"}`,
      ownerName: stringValue(apartment.ownerName) || stringValue(apartment.owner) || stringValue(apartment.ownerEmail),
      tenantName: tenantName || stringValue(apartment.residentName) || stringValue(apartment.residentEmail),
      hasOwner,
      hasResidents,
    };
  }).filter((apartment) => apartment.id && (apartment.hasOwner || apartment.hasResidents)), [apartments]);
  const recipientEstimate = useMemo(() => {
    const emails = new Set<string>();
    if (audience === "specific" && specificRecipientMode === "select" && apartmentIds.length === 0) return 0;
    const requestedBuildings = new Set(buildingIds);
    apartments.forEach((apartment) => {
      const apartmentId = stringValue(apartment.id) || stringValue(apartment.apartmentId);
      const buildingId = stringValue(apartment.buildingId);
      if ((requestedBuildings.size && !requestedBuildings.has(buildingId)) || (audience === "specific" && specificRecipientMode === "select" && !apartmentIds.includes(apartmentId))) return;
      const recipientMode = audience === "specific" ? (specificRecipientMode === "select" ? apartmentRecipientModes[apartmentId] ?? "all" : specificRecipientMode) : "all";
      const add = (email: unknown) => {
        const value = stringValue(email).toLowerCase();
        if (value.includes("@")) emails.add(value);
      };
      if (recipientMode !== "residents" && apartment.ownerActivated === true) add(apartment.ownerEmail);
      if (recipientMode !== "owners") {
        if (stringValue(apartment.residentId)) add(apartment.residentEmail);
        if (Array.isArray(apartment.tenants)) apartment.tenants.filter(isActiveTenant).forEach((tenant) => add((tenant as Record<string, unknown>).email));
      }
    });
    return emails.size;
  }, [apartments, audience, apartmentIds, apartmentRecipientModes, buildingIds, specificRecipientMode]);

  const toggleBuilding = (id: string) => setBuildingIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const toggleApartment = (id: string) => setApartmentIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const toggleWholeApartment = (id: string) => {
    if (apartmentIds.includes(id)) {
      setApartmentIds((current) => current.filter((item) => item !== id));
      return;
    }
    setApartmentIds((current) => [...current, id]);
    setApartmentRecipientModes((current) => ({ ...current, [id]: "all" }));
  };
  const toggleApartmentRecipient = (id: string, recipient: "owners" | "residents") => {
    const isApartmentSelected = apartmentIds.includes(id);
    const mode = apartmentRecipientModes[id] ?? "all";
    const current = isApartmentSelected
      ? { owners: mode !== "residents", residents: mode !== "owners" }
      : { owners: false, residents: false };
    const next = { ...current, [recipient]: !current[recipient] };
    if (!next.owners && !next.residents) {
      setApartmentIds((currentIds) => currentIds.filter((item) => item !== id));
      return;
    }
    setApartmentIds((currentIds) => currentIds.includes(id) ? currentIds : [...currentIds, id]);
    setApartmentRecipientModes((currentModes) => ({ ...currentModes, [id]: next.owners && next.residents ? "all" : next.owners ? "owners" : "residents" }));
  };
  const toggleApartmentExpanded = (id: string) => setExpandedApartmentIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const selectAudience = (value: Audience) => {
    setAudience(value);
    if (value !== "specific") setApartmentIds([]);
  };
  const send = async () => {
    if (!title.trim() || !message.trim()) {
      toast.warning(t("needContent"));
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const response = await apiFetch<{ recipients: number; sent: number; failed: number }>("/emails/information-mailing", {
        method: "POST",
        body: JSON.stringify({ title, message: `${message}\n\n${signature}`.trim(), messageHtml: `${messageHtml}<br><br>${signature.replace(/\n/g, "<br>")}`, audience, buildingIds, apartmentIds, apartmentRecipientModes, specificRecipientMode }),
      });
      setResult(response);
      setTitle("");
      setMessage("");
      setMessageHtml("");
      setSignature("");
      setAudience("all");
      setBuildingIds([]);
      setApartmentIds([]);
      setApartmentRecipientModes({});
      setSpecificRecipientMode("select");
      setEditorFormat(initialEditorFormatState);
      selectionRef.current = null;
      if (editorRef.current) editorRef.current.innerHTML = "";
      await refreshSavedItems();
      toast.success(t("sent", { count: response.sent }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("failed"));
    } finally {
      setSending(false);
    }
  };

  if (sentMode) {
    return <div className="mx-auto max-w-4xl"><SectionCard title="Отправленные письма" description="История информационных рассылок."><div className="overflow-hidden rounded-xl border border-slate-200 divide-y divide-slate-100">{history.length ? history.map((item) => <details key={item.id} className="group bg-white"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50 [&::-webkit-details-marker]:hidden"><span className="min-w-0"><span className="block truncate font-semibold text-slate-900">{item.title}</span><span className="mt-1 block text-sm text-slate-500">{formatHistoryDate(item.createdAt)}</span></span><span className="shrink-0 text-sm text-slate-500">{item.sent}/{item.recipients}</span></summary>{item.message ? <div className="border-t border-slate-100 bg-slate-50 px-5 py-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.message}</div> : null}</details>) : <div className="px-5 py-10 text-center text-sm text-slate-500">Отправленных писем пока нет.</div>}</div></SectionCard></div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <SectionCard
          titleAside={<div className="flex flex-wrap gap-2">{templateMode ? <button type="button" onClick={saveTemplate} style={{ backgroundColor: accentColor }} className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm"><Save className="h-4 w-4" />Сохранить шаблон</button> : <button type="button" disabled={sending || !recipientEstimate} onClick={send} style={{ backgroundColor: accentColor }} className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:bg-slate-300"><Send className="h-4 w-4" />{sending ? t("sending") : t("send", { count: recipientEstimate })}</button>}<button type="button" onClick={() => setPreviewOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"><Eye className="h-4 w-4" />{t("preview")}</button></div>}
          className="rounded-2xl border-slate-200 shadow-lg shadow-slate-950/[0.04]"
        >
          <div className="space-y-5">
            <div className="overflow-hidden rounded-lg border border-slate-300 bg-white">
              {templateMode ? <label className="grid grid-cols-[210px_1fr] border-b border-slate-200 text-sm"><span className="whitespace-nowrap bg-slate-50 px-4 py-3 font-medium text-slate-600">Название шаблона</span><input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Название шаблона" className="min-w-0 px-4 py-3 text-slate-900 outline-none" /></label> : <div className="grid grid-cols-[86px_1fr] border-b border-slate-200 text-sm"><div className="bg-slate-50 px-4 py-3 font-medium text-slate-600">{t("from")}</div><div className="px-4 py-3 text-slate-800">{companyName}</div></div>}
              {!templateMode ? <div className="grid grid-cols-[86px_1fr] border-b border-slate-200 text-sm"><span className="bg-slate-50 px-4 py-3 font-medium text-slate-600">{t("to")}</span><button type="button" onClick={() => setRecipientsOpen(true)} className="flex items-center justify-between px-4 py-3 text-left text-slate-800 hover:bg-slate-50"><span>{audience === "all" ? "Всем" : "Определённым квартирам"}</span><Users className="h-4 w-4 text-slate-400" /></button></div> : null}
              <label className={`grid ${templateMode ? "grid-cols-[210px_1fr]" : "grid-cols-[86px_1fr]"} border-b border-slate-200 text-sm`}><span className="bg-slate-50 px-4 py-3 font-medium text-slate-600">{t("subject")}</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={140} placeholder={t("noSubject")} className="min-w-0 px-4 py-3 text-slate-900 outline-none" /></label>
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">{t("messageHint")}</div>
              <div className="flex flex-wrap gap-1 border-b border-slate-200 bg-white px-3 py-2" onMouseDown={(event) => event.preventDefault()}>
                <button type="button" onClick={() => format("bold")} className={toolbarButtonClass(editorFormat.bold)} title="Bold" aria-pressed={editorFormat.bold}><Bold className="h-4 w-4" /></button>
                <button type="button" onClick={() => format("italic")} className={toolbarButtonClass(editorFormat.italic)} title="Italic" aria-pressed={editorFormat.italic}><Italic className="h-4 w-4" /></button>
                <button type="button" onClick={() => format("underline")} className={toolbarButtonClass(editorFormat.underline)} title="Underline" aria-pressed={editorFormat.underline}><Underline className="h-4 w-4" /></button>
                <span className="mx-1 border-l border-slate-200" />
                <button type="button" onClick={createLink} className={toolbarButtonClass(editorFormat.link)} title="Вставить ссылку в выделенный текст" aria-pressed={editorFormat.link}><Link className="h-4 w-4" /></button>
                <span className="mx-1 border-l border-slate-200" />
                <button type="button" onClick={() => format("justifyLeft")} className={toolbarButtonClass(editorFormat.alignment === "left")} title="Align left" aria-pressed={editorFormat.alignment === "left"}><AlignLeft className="h-4 w-4" /></button>
                <button type="button" onClick={() => format("justifyCenter")} className={toolbarButtonClass(editorFormat.alignment === "center")} title="Align center" aria-pressed={editorFormat.alignment === "center"}><AlignCenter className="h-4 w-4" /></button>
                <button type="button" onClick={() => format("justifyRight")} className={toolbarButtonClass(editorFormat.alignment === "right")} title="Align right" aria-pressed={editorFormat.alignment === "right"}><AlignRight className="h-4 w-4" /></button>
                <button type="button" onClick={() => format("justifyFull")} className={toolbarButtonClass(editorFormat.alignment === "justify")} title="Justify" aria-pressed={editorFormat.alignment === "justify"}><AlignJustify className="h-4 w-4" /></button>
              </div>
              <div ref={editorRef} contentEditable suppressContentEditableWarning onInput={syncEditor} onKeyUp={rememberSelection} onMouseUp={rememberSelection} data-placeholder={t("messagePlaceholder")} className="min-h-72 px-4 py-4 text-[15px] leading-7 text-slate-900 outline-none [&_a]:text-blue-600 [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-blue-700 empty:before:pointer-events-none empty:before:text-slate-400 empty:before:content-[attr(data-placeholder)]" />
              <textarea value={signature} onChange={(event) => setSignature(event.target.value)} rows={2} className="block w-full resize-y border-t border-slate-100 px-4 py-4 text-sm leading-6 text-slate-600 outline-none" />
            </div>
            {templateMode ? <div id="templates" className="rounded-xl border border-slate-200"><div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">Шаблоны</div>{templates.length ? <div className="divide-y divide-slate-100">{templates.map((template) => <div key={template.id} className="flex items-center justify-between gap-3 px-4 py-3"><div><p className="font-medium text-slate-800">{template.name}</p><p className="text-sm text-slate-500">{template.title}</p></div><div className="flex gap-1"><button type="button" onClick={() => loadTemplate(template)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100" title="Редактировать"><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => deleteTemplate(template.id)} className="rounded-md p-2 text-red-500 hover:bg-red-50" title="Удалить"><Trash2 className="h-4 w-4" /></button></div></div>)}</div> : <p className="px-4 py-6 text-sm text-slate-500">Сохранённых шаблонов пока нет.</p>}</div> : null}
            {!templateMode && availableBuildings.length > 1 ? <div><p className="text-sm font-medium text-slate-700">{t("buildings")} <span className="font-normal text-slate-400">{t("allBuildings")}</span></p><div className="mt-2 flex flex-wrap gap-2">{availableBuildings.map((building) => <button type="button" key={building.id} onClick={() => toggleBuilding(building.id)} className={`rounded-full border px-3 py-1.5 text-sm transition ${buildingIds.includes(building.id) ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:border-indigo-300"}`}>{building.name || building.address}</button>)}</div></div> : null}
            {!templateMode && result ? <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 className="h-5 w-5 shrink-0" />{t("sent", { count: result.sent })}{result.failed ? ` · ${result.failed}` : ""}</div> : null}
          </div>
        </SectionCard>
      </div>

      <Modal open={linkDialogOpen} onClose={() => setLinkDialogOpen(false)} title={<span className="inline-flex items-center gap-2"><Link className="h-5 w-5 text-indigo-600" />{editingLink ? "Изменить ссылку" : "Вставить ссылку"}</span>} size="sm" footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setLinkDialogOpen(false)} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">Отмена</button><button type="button" onClick={confirmLink} style={{ backgroundColor: accentColor }} className="rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-95">{editingLink ? "Сохранить ссылку" : "Добавить ссылку"}</button></div>}>
        <label className="block text-sm font-medium text-slate-700">
          Адрес ссылки
          <input autoFocus value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); confirmLink(); } }} placeholder="https://example.com" className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" />
        </label>
        <p className="mt-2 text-xs leading-5 text-slate-500">Используйте адрес, начинающийся с https:// или http://.</p>
      </Modal>
      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title={<span className="inline-flex items-center gap-2"><Eye className="h-5 w-5" />{t("previewTitle")}</span>} size="lg" footer={<div className="flex justify-end"><button type="button" onClick={() => setPreviewOpen(false)} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">{t("close")}</button></div>}>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="h-1" style={{ backgroundColor: accentColor }} />
            {logoDataUrl ? <div className="bg-slate-50 px-5 py-5 text-center"><img src={logoDataUrl} alt={`${companyName} logo`} className="mx-auto max-h-16 max-w-[240px] object-contain" /></div> : null}
            <div className="px-7 py-8 sm:px-10"><p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{companyName}</p><h2 className="mt-4 text-center text-xl font-semibold leading-tight text-slate-800">{title || t("emailSubject")}</h2>{messageHtml ? <div className="mailing-preview mt-8 text-[15px] leading-7 text-slate-700 [&_a]:text-blue-600 [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-blue-700" dangerouslySetInnerHTML={{ __html: sanitizePreviewHtml(messageHtml) }} /> : <div className="mt-8 text-[15px] leading-7 text-slate-700">{t("previewText")}</div>}<div className="mt-8 text-center"><span style={{ backgroundColor: accentColor }} className="inline-block rounded-lg px-5 py-2.5 text-sm font-semibold text-white">{mailingActionCopy.label}</span></div></div>
            <div className="border-t border-slate-100 px-6 py-4 text-center text-xs leading-5 text-slate-400">{mailingActionCopy.footer}</div>
          </div>
      </Modal>
      <Modal open={recipientsOpen} onClose={() => setRecipientsOpen(false)} title={<span className="inline-flex items-center gap-2"><Users className="h-5 w-5" />{t("to")}</span>} size="md" footer={<div className="flex justify-end"><button type="button" onClick={() => setRecipientsOpen(false)} style={{ backgroundColor: accentColor }} className="rounded-lg px-4 py-2 text-sm font-semibold text-white">{t("close")}</button></div>}>
        <p className="mb-4 text-sm text-slate-500">Выберите, кому отправить это сообщение.</p>
        <fieldset><legend className="mb-2 text-sm font-medium text-slate-600">Получатели</legend><div className="overflow-hidden rounded-xl border border-slate-200 bg-white divide-y divide-slate-100"><label className={`flex cursor-pointer items-center gap-3 px-4 py-3 text-sm font-medium transition ${audience === "all" ? "bg-indigo-50 text-indigo-900" : "text-slate-700 hover:bg-slate-50"}`}><input type="radio" name="mailing-audience" checked={audience === "all"} onChange={() => selectAudience("all")} className="h-4 w-4 border-slate-300 text-blue-600" />Отправить всем <span className="font-normal text-slate-500">(владельцам и арендаторам)</span></label><label className={`flex cursor-pointer items-center gap-3 px-4 py-3 text-sm font-medium transition ${audience === "specific" ? "bg-indigo-50 text-indigo-900" : "text-slate-700 hover:bg-slate-50"}`}><input type="radio" name="mailing-audience" checked={audience === "specific"} onChange={() => { selectAudience("specific"); setExpandedApartmentIds([]); }} className="h-4 w-4 border-slate-300 text-blue-600" />Выбрать получателей</label></div></fieldset>
        {availableBuildings.length > 1 ? <div className="mt-5"><p className="mb-2 text-sm font-medium text-slate-700">{t("buildings")}</p><div className="flex flex-wrap gap-2">{availableBuildings.map((building) => <button type="button" key={building.id} onClick={() => toggleBuilding(building.id)} className={`rounded-full border px-3 py-1.5 text-sm ${buildingIds.includes(building.id) ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 text-slate-600"}`}>{building.name || building.address}</button>)}</div></div> : null}
        {audience === "specific" ? <div className="mt-4"><div className="ml-5 space-y-1 border-l-2 border-indigo-100 pl-3"><label className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${specificRecipientMode === "owners" ? "bg-indigo-50 text-indigo-900" : "text-slate-700 hover:bg-slate-50"}`}><input type="radio" name="specific-recipient-mode" checked={specificRecipientMode === "owners"} onChange={() => setSpecificRecipientMode("owners")} className="h-4 w-4" />Только владельцам</label><label className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${specificRecipientMode === "residents" ? "bg-indigo-50 text-indigo-900" : "text-slate-700 hover:bg-slate-50"}`}><input type="radio" name="specific-recipient-mode" checked={specificRecipientMode === "residents"} onChange={() => setSpecificRecipientMode("residents")} className="h-4 w-4" />Только арендаторам</label><label className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${specificRecipientMode === "select" ? "bg-indigo-50 text-indigo-900" : "text-slate-700 hover:bg-slate-50"}`}><input type="radio" name="specific-recipient-mode" checked={specificRecipientMode === "select"} onChange={() => setSpecificRecipientMode("select")} className="h-4 w-4" />Выбрать получателей{apartmentIds.length ? ` · ${apartmentIds.length}` : ""}</label></div>{specificRecipientMode === "select" ? <div className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">{apartmentOptions.map((apartment) => { const selected = apartmentIds.includes(apartment.id); const expanded = expandedApartmentIds.includes(apartment.id); const mode = apartmentRecipientModes[apartment.id] ?? "all"; const ownerSelected = mode !== "residents"; const residentSelected = mode !== "owners"; return <div key={apartment.id} className={selected ? "bg-indigo-50/40" : "bg-white"}><div className="flex items-center gap-3 px-4 py-3"><button type="button" onClick={() => toggleApartmentExpanded(apartment.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium text-slate-700"><span className="truncate">{apartment.label} <span className="font-normal text-slate-500">· {[apartment.hasOwner ? "Владелец" : "", apartment.hasResidents ? "Арендатор" : ""].filter(Boolean).join(", ")}</span></span><ChevronDown className={`ml-auto h-4 w-4 shrink-0 text-slate-400 transition ${expanded ? "rotate-180" : ""}`} /></button><input aria-label={`Выбрать ${apartment.label}`} type="checkbox" checked={selected} ref={(element) => { if (element) element.indeterminate = selected && ownerSelected !== residentSelected; }} onChange={() => toggleWholeApartment(apartment.id)} className="h-5 w-5 shrink-0 rounded border-slate-300 accent-indigo-600" /></div>{expanded ? <div className="space-y-1 border-t border-slate-100 bg-slate-50 px-4 py-2">{apartment.hasOwner ? <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-2 text-sm text-slate-700 hover:bg-white"><span>{apartment.ownerName || "—"} <span className="text-slate-500">(Владелец)</span></span><input type="checkbox" checked={selected && ownerSelected} onChange={() => toggleApartmentRecipient(apartment.id, "owners")} className="h-5 w-5 rounded border-slate-300 accent-indigo-600" /></label> : null}{apartment.hasResidents ? <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-2 text-sm text-slate-700 hover:bg-white"><span>{apartment.tenantName || "—"} <span className="text-slate-500">(Арендатор)</span></span><input type="checkbox" checked={selected && residentSelected} onChange={() => toggleApartmentRecipient(apartment.id, "residents")} className="h-5 w-5 rounded border-slate-300 accent-indigo-600" /></label> : null}</div> : null}</div>; })}</div> : null}</div> : null}
       </Modal>
    </div>
  );
}
