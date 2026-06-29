import Image from "next/image";
import { getTranslations } from "next-intl/server";
import {
  FiBell,
  FiChevronDown,
  FiCreditCard,
  FiFileText,
  FiSearch,
  FiSettings,
  FiTrendingUp,
  FiUsers,
} from "react-icons/fi";
import { logoUrl } from "./landing-logo";

const sidebarItems = [
  { icon: FiUsers, key: "residents" },
  { icon: FiFileText, key: "leases" },
  { icon: FiCreditCard, key: "payments" },
  { icon: FiSettings, key: "maintenance" },
  { icon: FiFileText, key: "documents" },
];

const buildings = [
  ["Sunset Apartments", "48", "95.8%", "€12,850", "bg-emerald-500"],
  ["Greenview Tower", "72", "91.7%", "€18,720", "bg-emerald-500"],
  ["Lakeside Residence", "36", "88.9%", "€9,360", "bg-amber-500"],
  ["Maple Grove", "24", "100%", "€6,240", "bg-emerald-500"],
];

const transactions = [
  ["rent", "€2,145", "paid"],
  ["maintenance", "€320", "paid"],
  ["late", "€80", "late"],
];

function MiniLineChart() {
  return (
    <svg viewBox="0 0 320 110" className="h-full w-full" aria-hidden="true">
      <path d="M0 80 C35 75 45 88 76 70 S130 42 162 55 214 79 242 48 286 38 320 28" fill="none" stroke="#3b82f6" strokeWidth="4" strokeLinecap="round" />
      <path d="M0 88 C42 86 59 94 94 82 S151 64 184 73 244 95 320 66" fill="none" stroke="#93c5fd" strokeWidth="3" strokeLinecap="round" />
      {[0, 1, 2, 3].map((line) => (
        <line key={line} x1="0" x2="320" y1={20 + line * 22} y2={20 + line * 22} stroke="#e2e8f0" strokeWidth="1" />
      ))}
    </svg>
  );
}

function DonutChart() {
  return (
    <div className="relative h-28 w-28 rounded-full bg-[conic-gradient(#2563eb_0_71%,#60a5fa_71%_86%,#e5e7eb_86%_100%)] p-3">
      <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white text-center">
        <span className="text-base font-bold text-slate-950">€20,560</span>
        <span className="text-[10px] font-medium text-slate-500">Total</span>
      </div>
    </div>
  );
}

export async function DashboardPreview() {
  const t = await getTranslations("landing.dashboard");

  return (
    <div className="relative mx-auto w-full max-w-2xl lg:max-w-none">
      <div className="absolute -left-5 top-14 z-20 hidden rounded-[1.4rem] border border-blue-100 bg-white/95 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.12)] backdrop-blur sm:flex sm:min-w-64 sm:items-center sm:gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <FiCreditCard className="h-6 w-6" aria-hidden="true" />
        </span>
        <span>
          <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{t("paymentReceived")}</span>
          <span className="mt-1 block text-xl font-bold text-slate-950">€2 145</span>
        </span>
      </div>

      <div className="absolute -bottom-4 -right-3 z-20 hidden rounded-[1.4rem] border border-blue-100 bg-white/95 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.12)] backdrop-blur sm:flex sm:min-w-60 sm:items-center sm:gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <FiTrendingUp className="h-6 w-6" aria-hidden="true" />
        </span>
        <span>
          <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{t("monthlyCollection")}</span>
          <span className="mt-1 block text-xl font-bold text-slate-950">98.2%</span>
        </span>
      </div>

      <div className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_30px_90px_rgba(37,99,235,0.16)]">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-5 py-4">
          <div className="flex items-center gap-3">
            <div>
              <Image
                src={logoUrl}
                alt="Domera"
                width={112}
                height={28}
                className="h-7 w-auto object-contain"
              />
              <p className="text-[11px] font-medium text-slate-500">{t("productType")}</p>
            </div>
          </div>
          <div className="hidden h-9 min-w-72 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-400 md:flex">
            <FiSearch className="h-4 w-4" aria-hidden="true" />
            {t("search")}
          </div>
          <div className="flex items-center gap-3 text-slate-500">
            <FiBell className="h-4 w-4" aria-hidden="true" />
            <span className="h-8 w-8 rounded-full bg-[linear-gradient(135deg,#dbeafe,#fef3c7)]" />
            <FiChevronDown className="h-4 w-4" aria-hidden="true" />
          </div>
        </div>

        <div className="grid min-h-[390px] grid-cols-1 md:grid-cols-[130px_1fr]">
          <aside className="hidden border-r border-slate-100 bg-slate-50/60 p-4 md:block">
            <div className="space-y-2">
              {sidebarItems.map((item) => {
                const Icon = item.icon;

                return (
                  <div key={item.key} className="flex items-center gap-2 rounded-xl px-2 py-2 text-[11px] font-semibold text-slate-500">
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {t(`sidebar.${item.key}`)}
                  </div>
                );
              })}
            </div>
            <div className="mt-24 rounded-2xl border border-blue-100 bg-blue-50 p-3 text-center">
              <p className="text-[11px] font-bold text-slate-700">{t("upgradeTitle")}</p>
              <p className="mt-1 text-[10px] leading-4 text-slate-500">{t("upgradeText")}</p>
            </div>
          </aside>

          <main className="p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-lg font-bold text-slate-950">{t("overview")}</p>
                <p className="text-xs text-slate-500">{t("overviewText")}</p>
              </div>
              <button className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                {t("period")}
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["occupancy", "92.4%", "+8.7%"],
                ["debts", "€12,645", "-4.3%"],
                ["leases", "312", "+9.8%"],
              ].map(([key, value, delta]) => (
                <div key={key} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                  <p className="text-[11px] font-semibold text-slate-500">{t(`metrics.${key}`)}</p>
                  <p className="mt-2 text-xl font-bold text-slate-950">{value}</p>
                  <p className="mt-1 text-[10px] font-bold text-emerald-600">{t("delta", { value: delta })}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1.35fr_0.85fr]">
              <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-700">{t("utility")}</p>
                  <span className="text-[10px] font-semibold text-slate-400">{t("daily")}</span>
                </div>
                <div className="h-32">
                  <MiniLineChart />
                </div>
              </section>

              <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <p className="text-xs font-bold text-slate-700">{t("paymentsOverview")}</p>
                <div className="mt-3 flex items-center justify-center">
                  <DonutChart />
                </div>
              </section>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-700">{t("buildings")}</p>
                  <button className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-[10px] font-bold text-white">{t("addBuilding")}</button>
                </div>
                <div className="space-y-2">
                  {buildings.map(([name, units, occupancy, revenue, color]) => (
                    <div key={name} className="grid grid-cols-[1fr_32px_58px_58px] items-center gap-2 text-[10px]">
                      <span className="truncate font-semibold text-slate-700">{name}</span>
                      <span className="text-slate-500">{units}</span>
                      <span>
                        <span className="block h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <span className={`block h-full w-4/5 rounded-full ${color}`} />
                        </span>
                        <span className="mt-0.5 block text-slate-500">{occupancy}</span>
                      </span>
                      <span className="font-semibold text-slate-700">{revenue}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <p className="mb-3 text-xs font-bold text-slate-700">{t("recentTransactions")}</p>
                <div className="space-y-2">
                  {transactions.map(([key, amount, status]) => (
                    <div key={key} className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="min-w-0 truncate text-slate-600">{t(`transactions.${key}`)}</span>
                      <span className="font-bold text-slate-800">{amount}</span>
                      <span className={status === "paid" ? "font-bold text-emerald-600" : "font-bold text-amber-600"}>{t(`statuses.${status}`)}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
