"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition, useState, useRef, useEffect } from "react";

const locales = [
  { code: "lv", label: "LV", name: "Latviešu" },
  { code: "ru", label: "RU", name: "Русский" },
  { code: "en", label: "EN", name: "English" },
] as const;

export function LocaleSwitcher({
  dropUp = false,
  align = "right",
  iconOnly = false,
}: {
  dropUp?: boolean;
  align?: "left" | "right";
  iconOnly?: boolean;
}) {
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function switchLocale(next: string) {
    setOpen(false);
    startTransition(() => {
      document.cookie = `NEXT_LOCALE=${next};path=/;max-age=31536000`;
      router.refresh();
    });
  }

  const current = locales.find((l) => l.code === locale) ?? locales[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={isPending}
        className={`flex items-center text-sm font-medium text-slate-700 transition ${
          iconOnly
            ? "h-11 w-11 justify-center rounded-2xl bg-transparent"
            : "gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 shadow-sm"
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className={`text-slate-400 ${iconOnly ? "h-5 w-5" : "h-4 w-4"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        {!iconOnly ? <span>{current.label}</span> : null}
        {!iconOnly ? (
          <svg xmlns="http://www.w3.org/2000/svg" className={`h-3.5 w-3.5 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        ) : null}
      </button>

      {open && (
        <div className={`absolute z-30 w-36 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-lg ${
          align === "left" ? "left-0" : "right-0"
        } ${
          dropUp ? "bottom-full mb-1.5" : "mt-1.5"
        }`}>
          {locales.map(({ code, name }) => (
            <button
              key={code}
              onClick={() => switchLocale(code)}
              className={`w-full px-4 py-2.5 text-left text-sm font-medium transition ${
                locale === code
                  ? "bg-slate-900 text-white"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
