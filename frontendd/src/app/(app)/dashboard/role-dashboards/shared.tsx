import { Circle } from "lucide-react";
import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string;
  hint: string;
  accent?: "orange" | "blue" | "green" | "red" | "purple" | "yellow";
}

const accentMap: Record<NonNullable<StatCardProps["accent"]>, string> = {
  orange: "bg-orange-50 text-orange-600 ring-orange-100",
  blue: "bg-sky-50 text-sky-600 ring-sky-100",
  green: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  red: "bg-rose-50 text-rose-600 ring-rose-100",
  purple: "bg-violet-50 text-violet-600 ring-violet-100",
  yellow: "bg-amber-50 text-amber-600 ring-amber-100",
};

export function StatCard({ label, value, hint, accent = "blue" }: StatCardProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/[0.03]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
          <p className="mt-2 text-sm text-slate-500">{hint}</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ring-1 ${accentMap[accent]}`}>
          <Circle className="h-4 w-4 fill-current" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

export function SurfaceCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/[0.03]">
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function MiniBadge({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">{children}</span>;
}

export function PlaceholderLineChart() {
  const values = [62, 70, 68, 75, 74, 80];

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex h-48 items-end gap-3">
        {values.map((value, index) => (
          <div key={`${value}-${index}`} className="flex flex-1 flex-col items-center justify-end gap-2">
            <div className="w-full rounded-t bg-sky-500/85" style={{ height: `${value}%` }} />
            <span className="text-xs text-slate-400">{["Oct", "Nov", "Dec", "Jan", "Feb", "Mar"][index]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlaceholderBarChart() {
  const values = [84, 61, 52, 28];

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      {values.map((value, index) => (
        <div key={`${value}-${index}`}>
          <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
            <span>{["Brivibas 123", "Elizabetes 45", "K. Barona 78", "Valdemara 56"][index]}</span>
            <span>{value}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-200">
            <div className="h-2.5 rounded-full bg-rose-500" style={{ width: `${value}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
