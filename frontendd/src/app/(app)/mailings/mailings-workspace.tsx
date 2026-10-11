"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, CheckCircle2, Eye, Italic, Link, Pencil, Save, Send, Trash2, Underline, Users } from "lucide-react";
import { SectionCard } from "@/components/section-card";
import { Modal } from "@/components/ui/modal";
import { apiFetch } from "@/shared/api/client";
import { useNotifications } from "@/shared/hooks/use-notifications";
import type { Building, Resident } from "@/shared/lib/data";

type Props = { buildings: Building[]; apartments: Record<string, unknown>[]; residents: Resident[]; company: Record<string, unknown> | null };
type Audience = "all" | "owners" | "residents";

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
function toPlainText(value: string) { return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function sanitizePreviewHtml(value: string) {
  return value.replace(/<(\/)?([a-z0-9]+)([^>]*)>/gi, (_match, closing: string, tag: string, attributes: string) => {
    const name = tag.toLowerCase();
    if (!['b', 'strong', 'i', 'em', 'u', 'p', 'div', 'br', 'ul', 'ol', 'li', 'a'].includes(name)) return '';
    if (closing) return `</${name}>`;
    if (name === 'a') { const href = /href\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1] ?? ''; return /^https?:\/\//i.test(href) ? `<a href="${href.replace(/"/g, '&quot;')}">` : '<a>'; }
    const align = /text-align\s*:\s*(left|center|right|justify)/i.exec(attributes)?.[1];
    return align && (name === 'p' || name === 'div') ? `<${name} style="text-align:${align}">` : `<${name}>`;
  });
}
type MailingTemplate = { id: string; name: string; title: string; message: string; messageHtml?: string };
type MailingHistory = { id: string; title: string; recipients: number; sent: number; failed: number; createdAt?: string };

export function MailingsWorkspace({ buildings, apartments, residents, company }: Props) {
  const t = useTranslations("mailings");
  const searchParams = useSearchParams();
  const templateMode = searchParams.get("mode") === "templates";
  const toast = useNotifications();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [messageHtml, setMessageHtml] = useState("");
  const [audience, setAudience] = useState<Audience>("all");
  const [buildingIds, setBuildingIds] = useState<string[]>([]);
  const [apartmentIds, setApartmentIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ recipients: number; sent: number; failed: number } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [recipientsOpen, setRecipientsOpen] = useState(false);
  const [signature, setSignature] = useState("");
  const [templates, setTemplates] = useState<MailingTemplate[]>([]);
  const [history, setHistory] = useState<MailingHistory[]>([]);
  const [templateName, setTemplateName] = useState("");
  const editorRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<Range | null>(null);
  const invoiceSettings = company?.invoiceSettings && typeof company.invoiceSettings === "object" ? company.invoiceSettings as Record<string, unknown> : {};
  const companyName = stringValue(company?.companyName) || stringValue(company?.name) || "Domera";
  const accentColor = /^#[0-9a-f]{6}$/i.test(stringValue(invoiceSettings.accentColor)) ? stringValue(invoiceSettings.accentColor) : "#4f46e5";
  const logoDataUrl = invoiceSettings.logoHidden === true ? "" : stringValue(invoiceSettings.logoDataUrl);
  useEffect(() => { setSignature((current) => current || `${t("signature")}\n${companyName}`); }, [companyName, t]);

  const refreshSavedItems = () => Promise.all([
    apiFetch<{ items: MailingTemplate[] }>("/emails/information-mailing/templates").then((data) => setTemplates(data.items ?? [])).catch(() => undefined),
    apiFetch<{ items: MailingHistory[] }>("/emails/information-mailing/history").then((data) => setHistory(data.items ?? [])).catch(() => undefined),
  ]);
  useEffect(() => { void refreshSavedItems(); }, []);
  const syncEditor = () => { const html = editorRef.current?.innerHTML ?? ""; setMessageHtml(html); setMessage(toPlainText(html)); };
  const rememberSelection = () => { const selection = window.getSelection(); if (selection?.rangeCount) selectionRef.current = selection.getRangeAt(0).cloneRange(); };
  const restoreSelection = () => { if (!selectionRef.current) return; const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(selectionRef.current); };
  const format = (command: string) => { editorRef.current?.focus(); restoreSelection(); document.execCommand(command); syncEditor(); rememberSelection(); };
  const createLink = () => { const url = window.prompt("https://"); if (url && /^https?:\/\//i.test(url)) { editorRef.current?.focus(); restoreSelection(); document.execCommand("createLink", false, url); syncEditor(); rememberSelection(); } else if (url) toast.warning("Укажите ссылку, начинающуюся с https:// или http://"); };
  const saveTemplate = async () => {
    const name = templateName.trim();
    if (!name || !title.trim() || !message.trim()) return toast.warning(t("needContent"));
    try { await apiFetch("/emails/information-mailing/templates", { method: "POST", body: JSON.stringify({ name, title, message, messageHtml }) }); setTemplateName(""); await refreshSavedItems(); toast.success(t("templateSaved")); } catch { toast.error(t("templateSaveFailed")); }
  };
  const loadTemplate = (template: MailingTemplate) => { setTitle(template.title); setMessage(template.message); setMessageHtml(template.messageHtml ?? template.message); if (editorRef.current) editorRef.current.innerHTML = template.messageHtml ?? template.message; };
  const deleteTemplate = async (id: string) => { try { await apiFetch(`/emails/information-mailing/templates/${encodeURIComponent(id)}`, { method: "DELETE" }); await refreshSavedItems(); } catch { toast.error(t("failed")); } };

  const availableBuildings = buildings.filter((building) => building.id);
  const apartmentOptions = useMemo(() => apartments.map((apartment) => ({
    id: stringValue(apartment.id) || stringValue(apartment.apartmentId),
    label: [stringValue(apartment.buildingName) || stringValue(apartment.building), stringValue(apartment.number) || stringValue(apartment.apartmentNumber) || stringValue(apartment.flatNumber)].filter(Boolean).join(" · ") || stringValue(apartment.id),
  })).filter((apartment) => apartment.id), [apartments]);
  const recipientEstimate = useMemo(() => {
    const emails = new Set<string>();
    const requestedBuildings = new Set(buildingIds);
    apartments.forEach((apartment) => {
      const buildingId = stringValue(apartment.buildingId);
      if ((requestedBuildings.size && !requestedBuildings.has(buildingId)) || (apartmentIds.length && !apartmentIds.includes(stringValue(apartment.id) || stringValue(apartment.apartmentId)))) return;
      const add = (email: unknown) => {
        const value = stringValue(email).toLowerCase();
        if (value.includes("@")) emails.add(value);
      };
      if (audience === "all" || audience === "owners") add(apartment.ownerEmail);
      if (audience === "all" || audience === "residents") {
        add(apartment.residentEmail);
        if (Array.isArray(apartment.tenants)) apartment.tenants.forEach((tenant) => add((tenant as Record<string, unknown>)?.email));
      }
    });
    if (!emails.size) {
      residents.forEach((resident) => {
        if (resident.email && (audience === "all" || (audience === "owners" ? resident.role.toLowerCase().includes("owner") : !resident.role.toLowerCase().includes("owner")))) emails.add(resident.email.toLowerCase());
      });
    }
    return emails.size;
  }, [apartments, audience, apartmentIds, buildingIds, residents]);

  const toggleBuilding = (id: string) => setBuildingIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const toggleApartment = (id: string) => setApartmentIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
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
        body: JSON.stringify({ title, message: `${message}\n\n${signature}`.trim(), messageHtml: `${messageHtml}<br><br>${signature.replace(/\n/g, "<br>")}`, audience, buildingIds, apartmentIds }),
      });
      setResult(response);
      await refreshSavedItems();
      toast.success(t("sent", { count: response.sent }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("failed"));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <SectionCard
          title={templateMode ? undefined : t("newEmail")}
          titleAside={<div className="flex flex-wrap gap-2">{templateMode ? <button type="button" onClick={saveTemplate} style={{ backgroundColor: accentColor }} className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm"><Save className="h-4 w-4" />Сохранить шаблон</button> : <button type="button" disabled={sending || !recipientEstimate} onClick={send} style={{ backgroundColor: accentColor }} className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:bg-slate-300"><Send className="h-4 w-4" />{sending ? t("sending") : t("send", { count: recipientEstimate })}</button>}<button type="button" onClick={() => setPreviewOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"><Eye className="h-4 w-4" />{t("preview")}</button></div>}
          className="rounded-2xl border-slate-200 shadow-lg shadow-slate-950/[0.04]"
        >
          <div className="space-y-5">
            <div className="overflow-hidden rounded-lg border border-slate-300 bg-white">
              {templateMode ? <label className="grid grid-cols-[210px_1fr] border-b border-slate-200 text-sm"><span className="whitespace-nowrap bg-slate-50 px-4 py-3 font-medium text-slate-600">Название шаблона</span><input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Название шаблона" className="min-w-0 px-4 py-3 text-slate-900 outline-none" /></label> : <div className="grid grid-cols-[86px_1fr] border-b border-slate-200 text-sm"><div className="bg-slate-50 px-4 py-3 font-medium text-slate-600">{t("from")}</div><div className="px-4 py-3 text-slate-800">{companyName}</div></div>}
              {!templateMode ? <div className="grid grid-cols-[86px_1fr] border-b border-slate-200 text-sm"><span className="bg-slate-50 px-4 py-3 font-medium text-slate-600">{t("to")}</span><button type="button" onClick={() => setRecipientsOpen(true)} className="flex items-center justify-between px-4 py-3 text-left text-slate-800 hover:bg-slate-50"><span>{audience === "all" ? t("all") : audience === "owners" ? t("owners") : t("residents")}</span><Users className="h-4 w-4 text-slate-400" /></button></div> : null}
              <label className={`grid ${templateMode ? "grid-cols-[210px_1fr]" : "grid-cols-[86px_1fr]"} border-b border-slate-200 text-sm`}><span className="bg-slate-50 px-4 py-3 font-medium text-slate-600">{t("subject")}</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={140} placeholder={t("noSubject")} className="min-w-0 px-4 py-3 text-slate-900 outline-none" /></label>
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">{t("messageHint")}</div>
              <div className="flex flex-wrap gap-1 border-b border-slate-200 bg-white px-3 py-2" onMouseDown={(event) => event.preventDefault()}><button type="button" onClick={() => format("bold")} className="rounded p-2 hover:bg-slate-100" title="Bold"><Bold className="h-4 w-4" /></button><button type="button" onClick={() => format("italic")} className="rounded p-2 hover:bg-slate-100" title="Italic"><Italic className="h-4 w-4" /></button><button type="button" onClick={() => format("underline")} className="rounded p-2 hover:bg-slate-100" title="Underline"><Underline className="h-4 w-4" /></button><span className="mx-1 border-l border-slate-200" /><button type="button" onClick={createLink} className="rounded p-2 hover:bg-slate-100" title="Вставить ссылку в выделенный текст"><Link className="h-4 w-4" /></button><span className="mx-1 border-l border-slate-200" /><button type="button" onClick={() => format("justifyLeft")} className="rounded p-2 hover:bg-slate-100" title="Align left"><AlignLeft className="h-4 w-4" /></button><button type="button" onClick={() => format("justifyCenter")} className="rounded p-2 hover:bg-slate-100" title="Align center"><AlignCenter className="h-4 w-4" /></button><button type="button" onClick={() => format("justifyRight")} className="rounded p-2 hover:bg-slate-100" title="Align right"><AlignRight className="h-4 w-4" /></button><button type="button" onClick={() => format("justifyFull")} className="rounded p-2 hover:bg-slate-100" title="Justify"><AlignJustify className="h-4 w-4" /></button></div>
              <div ref={editorRef} contentEditable suppressContentEditableWarning onInput={syncEditor} onKeyUp={rememberSelection} onMouseUp={rememberSelection} data-placeholder={t("messagePlaceholder")} className="min-h-72 px-4 py-4 text-[15px] leading-7 text-slate-900 outline-none empty:before:pointer-events-none empty:before:text-slate-400 empty:before:content-[attr(data-placeholder)]" />
              <textarea value={signature} onChange={(event) => setSignature(event.target.value)} rows={2} className="block w-full resize-y border-t border-slate-100 px-4 py-4 text-sm leading-6 text-slate-600 outline-none" />
            </div>
            {!templateMode ? <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm leading-5 text-slate-600">{t("notificationHint")}</div> : null}
            {templateMode ? <div id="templates" className="rounded-xl border border-slate-200"><div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">Шаблоны</div>{templates.length ? <div className="divide-y divide-slate-100">{templates.map((template) => <div key={template.id} className="flex items-center justify-between gap-3 px-4 py-3"><div><p className="font-medium text-slate-800">{template.name}</p><p className="text-sm text-slate-500">{template.title}</p></div><div className="flex gap-1"><button type="button" onClick={() => loadTemplate(template)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100" title="Редактировать"><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => deleteTemplate(template.id)} className="rounded-md p-2 text-red-500 hover:bg-red-50" title="Удалить"><Trash2 className="h-4 w-4" /></button></div></div>)}</div> : <p className="px-4 py-6 text-sm text-slate-500">Сохранённых шаблонов пока нет.</p>}</div> : null}
            {!templateMode && availableBuildings.length > 1 ? <div><p className="text-sm font-medium text-slate-700">{t("buildings")} <span className="font-normal text-slate-400">{t("allBuildings")}</span></p><div className="mt-2 flex flex-wrap gap-2">{availableBuildings.map((building) => <button type="button" key={building.id} onClick={() => toggleBuilding(building.id)} className={`rounded-full border px-3 py-1.5 text-sm transition ${buildingIds.includes(building.id) ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:border-indigo-300"}`}>{building.name || building.address}</button>)}</div></div> : null}
            {!templateMode && result ? <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 className="h-5 w-5 shrink-0" />{t("sent", { count: result.sent })}{result.failed ? ` · ${result.failed}` : ""}</div> : null}
          </div>
        </SectionCard>
      </div>

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title={<span className="inline-flex items-center gap-2"><Eye className="h-5 w-5" />{t("previewTitle")}</span>} size="lg" footer={<div className="flex justify-end"><button type="button" onClick={() => setPreviewOpen(false)} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">{t("close")}</button></div>}>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="h-1" style={{ backgroundColor: accentColor }} />
            {logoDataUrl ? <div className="bg-slate-50 px-5 py-5 text-center"><img src={logoDataUrl} alt={`${companyName} logo`} className="mx-auto max-h-16 max-w-[240px] object-contain" /></div> : null}
            <div className="px-7 py-8 sm:px-10"><p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{companyName}</p><h2 className="mt-4 text-center text-xl font-semibold leading-tight text-slate-800">{title || t("emailSubject")}</h2>{messageHtml ? <div className="mailing-preview mt-8 text-[15px] leading-7 text-slate-700" dangerouslySetInnerHTML={{ __html: sanitizePreviewHtml(messageHtml) }} /> : <div className="mt-8 text-[15px] leading-7 text-slate-700">{t("previewText")}</div>}<div className="mt-8 text-center"><span style={{ backgroundColor: accentColor }} className="inline-block rounded-lg px-5 py-2.5 text-sm font-semibold text-white">{t("openNotifications")}</span></div></div>
            <div className="border-t border-slate-100 px-6 py-4 text-center text-xs leading-5 text-slate-400">{t("automated", { company: companyName })}</div>
          </div>
      </Modal>
      <Modal open={recipientsOpen} onClose={() => setRecipientsOpen(false)} title={<span className="inline-flex items-center gap-2"><Users className="h-5 w-5" />{t("to")}</span>} size="md" footer={<div className="flex justify-end"><button type="button" onClick={() => setRecipientsOpen(false)} style={{ backgroundColor: accentColor }} className="rounded-lg px-4 py-2 text-sm font-semibold text-white">{t("close")}</button></div>}>
        <p className="mb-4 text-sm text-slate-500">Выберите, кому отправить это сообщение.</p>
        <div className="space-y-2">{(["all", "residents", "owners"] as Audience[]).map((option) => <button key={option} type="button" onClick={() => setAudience(option)} className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition ${audience === option ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-slate-300"}`}><span className="font-medium text-slate-800">{option === "all" ? t("all") : option === "owners" ? t("owners") : t("residents")}</span>{audience === option ? <CheckCircle2 className="h-5 w-5 text-indigo-600" /> : null}</button>)}</div>
        {availableBuildings.length > 1 ? <div className="mt-5"><p className="mb-2 text-sm font-medium text-slate-700">{t("buildings")}</p><div className="flex flex-wrap gap-2">{availableBuildings.map((building) => <button type="button" key={building.id} onClick={() => toggleBuilding(building.id)} className={`rounded-full border px-3 py-1.5 text-sm ${buildingIds.includes(building.id) ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 text-slate-600"}`}>{building.name || building.address}</button>)}</div></div> : null}
        {apartmentOptions.length ? <div className="mt-5"><div className="mb-2 flex items-center justify-between"><p className="text-sm font-medium text-slate-700">Квартиры</p><button type="button" onClick={() => setApartmentIds([])} className="text-xs font-medium text-indigo-600">Все квартиры</button></div><div className="max-h-52 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">{apartmentOptions.map((apartment) => <label key={apartment.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-50"><input type="checkbox" checked={apartmentIds.includes(apartment.id)} onChange={() => toggleApartment(apartment.id)} className="h-4 w-4 rounded border-slate-300" /><span className="text-sm text-slate-700">{apartment.label}</span></label>)}</div><p className="mt-2 text-xs text-slate-500">Выбрано квартир: {apartmentIds.length || "все"}</p></div> : null}
       </Modal>
      {history.length ? <div id="sent"><SectionCard title="История отправок"><div className="divide-y divide-slate-100">{history.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><div><p className="font-medium text-slate-800">{item.title}</p><p className="text-slate-500">{item.createdAt ? new Date(item.createdAt).toLocaleString() : ""}</p></div><span className="text-slate-600">{item.sent}/{item.recipients}</span></div>)}</div></SectionCard></div> : null}
    </div>
  );
}
