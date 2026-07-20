"use client";

import {
  Euro,
  Headphones,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  WalletCards,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

const PRICE_PER_APARTMENT = 0.5;
const MIN_APARTMENTS = 1;
const MAX_APARTMENTS = 5000;

function clampApartmentCount(value: number) {
  if (!Number.isFinite(value)) return MIN_APARTMENTS;
  return Math.min(MAX_APARTMENTS, Math.max(MIN_APARTMENTS, Math.round(value)));
}

function formatEuro(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function PricingSection() {
  const t = useTranslations("landing.pricing");
  const [apartmentCount, setApartmentCount] = useState(250);
  const [inputValue, setInputValue] = useState("250");

  const monthlyPrice = apartmentCount * PRICE_PER_APARTMENT;
  const sliderProgress =
    ((apartmentCount - MIN_APARTMENTS) / (MAX_APARTMENTS - MIN_APARTMENTS)) * 100;

  const benefits = useMemo(
    () => [
      { icon: Euro, label: t("benefits.price") },
      { icon: WalletCards, label: t("benefits.noMinimum") },
      { icon: Sparkles, label: t("benefits.noSetup") },
      { icon: RefreshCw, label: t("benefits.updates") },
      { icon: Headphones, label: t("benefits.support") },
    ],
    [t],
  );

  function updateApartmentCount(nextValue: number) {
    const nextCount = clampApartmentCount(nextValue);
    setApartmentCount(nextCount);
    setInputValue(String(nextCount));
  }

  function handleInputChange(value: string) {
    setInputValue(value);

    if (!value.trim()) return;

    const parsedValue = Number(value);
    if (Number.isFinite(parsedValue)) {
      setApartmentCount(clampApartmentCount(parsedValue));
    }
  }

  function normalizeInputValue() {
    updateApartmentCount(Number(inputValue));
  }

  return (
    <section id="pricing" className="relative overflow-hidden bg-white px-6 py-18 md:py-24">
      <div
        className="relative mx-auto max-w-7xl"
      >
        <div className="group relative mx-auto max-w-4xl overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white/85 p-5 shadow-[0_26px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl transition-transform duration-300 hover:-translate-y-1 md:p-6 lg:p-8">
          <div className="pointer-events-none absolute -right-16 -top-20 h-60 w-60 rounded-full bg-[#155DFC]/10 blur-3xl" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.8),rgba(255,255,255,0)_34%,rgba(21,93,252,0.08)_72%,rgba(255,255,255,0.65))] opacity-80 transition duration-500 group-hover:translate-x-6" />

          <div className="relative mx-auto flex max-w-3xl flex-col">
            <div className="text-center">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#155DFC]">
                {t("eyebrow")}
              </p>
              <h2 className="mt-3 text-3xl font-bold leading-tight text-slate-950 md:text-4xl">
                {t("title")}
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
                {t("description")}
              </p>
            </div>

            <div className="my-6 h-px w-full bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#155DFC] text-white shadow-lg shadow-blue-600/25">
                  <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#155DFC]">
                    {t("calculator.label")}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">{t("calculator.hint")}</p>
                </div>
              </div>

              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#155DFC] text-white shadow-xl shadow-blue-600/25">
                <Euro className="h-5 w-5" aria-hidden="true" />
              </span>
            </div>

            <div className="mt-7 grid gap-4 rounded-[1.5rem] border border-slate-200 bg-white/75 p-5 shadow-sm md:grid-cols-[1.15fr_0.85fr] md:items-end">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#155DFC]">
                  {t("priceCard.eyebrow")}
                </p>
                <h3 className="mt-2 text-2xl font-bold text-slate-950 md:text-3xl">
                  {t("priceCard.title")}
                </h3>
                <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-2">
                  <p
                    className="text-6xl font-bold leading-none tracking-normal text-slate-950 md:text-7xl"
                    aria-live="polite"
                  >
                    {formatEuro(monthlyPrice)}
                  </p>
                  <p className="pb-2 text-base font-semibold text-slate-500">
                    {t("priceCard.perMonth")}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50/80 p-4 ring-1 ring-slate-200/80">
                <p
                  key={apartmentCount}
                  className="text-4xl font-bold leading-none text-slate-950 md:text-5xl"
                >
                  {apartmentCount.toLocaleString("en-US")}
                </p>
                <p className="mt-2 text-base font-semibold text-slate-500">
                  {t("calculator.apartments")}
                </p>
                <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                  {t("priceCard.formula", {
                    apartments: apartmentCount.toLocaleString("en-US"),
                    price: PRICE_PER_APARTMENT.toFixed(2),
                  })}
                </div>
              </div>
            </div>

            <div className="mt-6 w-full space-y-4">
              <input
                aria-label={t("calculator.inputAria")}
                type="range"
                min={MIN_APARTMENTS}
                max={MAX_APARTMENTS}
                step={1}
                value={apartmentCount}
                onChange={(event) => updateApartmentCount(Number(event.target.value))}
                className="h-3 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-[#155DFC] outline-none transition [--thumb-size:1.5rem] [&::-moz-range-thumb]:h-[var(--thumb-size)] [&::-moz-range-thumb]:w-[var(--thumb-size)] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-4 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-[#155DFC] [&::-moz-range-thumb]:shadow-[0_10px_30px_rgba(21,93,252,0.35)] [&::-webkit-slider-thumb]:h-[var(--thumb-size)] [&::-webkit-slider-thumb]:w-[var(--thumb-size)] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-[#155DFC] [&::-webkit-slider-thumb]:shadow-[0_10px_30px_rgba(21,93,252,0.35)]"
                style={{
                  background: `linear-gradient(90deg, #155DFC 0%, #155DFC ${sliderProgress}%, #E2E8F0 ${sliderProgress}%, #E2E8F0 100%)`,
                }}
              />

              <div className="flex flex-col justify-center gap-3 sm:flex-row sm:items-center">
                <label className="text-sm font-semibold text-slate-600" htmlFor="pricing-apartments">
                  {t("calculator.manualLabel")}
                </label>
                <input
                  id="pricing-apartments"
                  type="number"
                  min={MIN_APARTMENTS}
                  max={MAX_APARTMENTS}
                  step={1}
                  value={inputValue}
                  onBlur={normalizeInputValue}
                  onChange={(event) => handleInputChange(event.target.value)}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-center text-lg font-bold text-slate-950 shadow-sm outline-none transition focus:border-[#155DFC] focus:ring-4 focus:ring-blue-600/10 sm:max-w-44"
                />
              </div>

              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                <span>{MIN_APARTMENTS}</span>
                <span>{MAX_APARTMENTS.toLocaleString("en-US")}</span>
              </div>
            </div>

            <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
              {benefits.map((benefit) => {
                const Icon = benefit.icon;

                return (
                  <div key={benefit.label} className="flex items-center gap-3 rounded-2xl bg-white/70 px-3 py-2.5 text-left text-sm font-semibold text-slate-700 ring-1 ring-slate-200/80">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#155DFC]">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    {benefit.label}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
