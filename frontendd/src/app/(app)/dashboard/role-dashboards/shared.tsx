import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string;
  hint: string;
  accent?: "orange" | "blue" | "green" | "red" | "purple" | "yellow";
}

const accentMap: Record<NonNullable<StatCardProps["accent"]>, string> = {
  orange: "bg-orange-50 text-orange-600",
  blue: "bg-blue-50 text-blue-600",
  green: "bg-emerald-50 text-emerald-600",
  red: "bg-rose-50 text-rose-600",
  purple: "bg-violet-50 text-violet-600",
  yellow: "bg-amber-50 text-amber-600",
};

export function StatCard({ label, value, hint, accent = "blue" }: StatCardProps) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
          <p className="mt-2 text-sm text-slate-500">{hint}</p>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${accentMap[accent]}`}>
          <span className="text-lg">●</span>
        </div>
      </div>
    </div>
  );
}

export function SurfaceCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function MiniBadge({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{children}</span>;
}

export function PlaceholderLineChart() {
  const values = [62, 70, 68, 75, 74, 80];

  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex h-48 items-end gap-3">
        {values.map((value, index) => (
          <div key={`${value}-${index}`} className="flex flex-1 flex-col items-center justify-end gap-2">
            <div className="w-full rounded-t-2xl bg-orange-400/85" style={{ height: `${value}%` }} />
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
    <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
      {values.map((value, index) => (
        <div key={`${value}-${index}`}>
          <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
            <span>{["Brīvības 123", "Elizabetes 45", "K. Barona 78", "Valdemāra 56"][index]}</span>
            <span>{value}%</span>
          </div>
          <div className="h-3 rounded-full bg-slate-200">
            <div className="h-3 rounded-full bg-rose-500" style={{ width: `${value}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
