"use client";

import { useState } from "react";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";

type DetailRow = [string, string];

interface MeterSection {
  title: string;
  summaryRows: DetailRow[];
  historyRows: string[][];
}

interface ApartmentFullInfoDialogProps {
  buttonLabel: string;
  title: string;
  description: string;
  closeLabel: string;
  generalTitle: string;
  companyTitle: string;
  metersTitle: string;
  historyTitle: string;
  fieldColumnLabel: string;
  valueColumnLabel: string;
  historyColumnLabels: [string, string, string, string, string, string];
  generalRows: DetailRow[];
  companyRows: DetailRow[];
  meterSections: MeterSection[];
}

function ModalShell({
  open,
  title,
  description,
  closeLabel,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  closeLabel: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 pr-8">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          {description ? <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p> : null}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label={closeLabel}
        >
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
            <path d="m5.5 5.5 9 9M14.5 5.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {children}
        </div>
      </div>
    </div>
  );
}

export function ApartmentFullInfoDialog({
  buttonLabel,
  title,
  description,
  closeLabel,
  generalTitle,
  companyTitle,
  metersTitle,
  historyTitle,
  fieldColumnLabel,
  valueColumnLabel,
  historyColumnLabels,
  generalRows,
  companyRows,
  meterSections,
}: ApartmentFullInfoDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="mt-5 flex justify-center sm:justify-start">
        <Button type="button" size="sm" className="min-w-0 px-5" onClick={() => setOpen(true)}>
          {buttonLabel}
        </Button>
      </div>

      <ModalShell
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={description}
        closeLabel={closeLabel}
      >
        <div className="space-y-5">
          <div>
            <p className="mb-3 text-sm font-semibold text-slate-900">{generalTitle}</p>
            <DataTable
              columns={[fieldColumnLabel, valueColumnLabel]}
              rows={generalRows}
              pageSize={100}
            />
          </div>


          

          <div className="flex justify-end pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
              {closeLabel}
            </Button>
          </div>
        </div>
      </ModalShell>
    </>
  );
}
