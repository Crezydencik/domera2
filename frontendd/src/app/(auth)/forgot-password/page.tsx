"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROUTES } from "@/shared/lib/routes";
import { apiFetch, DomeraApiError } from "@/shared/api/client";

export default function ForgotPasswordPage() {
  const t = useTranslations("auth");
  const s = useTranslations("system");

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const normalizedEmail = email.trim().toLowerCase();

      await apiFetch("/auth/send-password-reset", {
        method: "POST",
        body: JSON.stringify({ email: normalizedEmail }),
      });

      if (typeof window !== "undefined") {
        window.localStorage.setItem("domera_reset_email", normalizedEmail);
        document.cookie = `domera_reset_email=${encodeURIComponent(normalizedEmail)}; max-age=${60 * 60}; path=/; SameSite=Lax`;
      }

      setSent(true);
    } catch (error) {
      if (error instanceof DomeraApiError && error.message.trim()) {
        setError(error.message);
      } else {
        setError(s("dbError"));
      }
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50">
          <svg
            className="h-8 w-8 text-blue-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.8}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 className="mt-5 text-2xl font-bold text-slate-900">{t("checkEmail")}</h1>
        <p className="mt-2 text-sm text-slate-500">{t("checkEmailDesc")}</p>
        <p className="mt-1 text-sm font-medium text-slate-700">{email}</p>
        <div className="mt-8">
          <Link href={ROUTES.login}>
            <Button variant="primary" size="lg" className="w-full">
              {s("button.backToLogin")}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link
        href={ROUTES.login}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        {s("button.backToLogin")}
      </Link>

      <h1 className="text-2xl font-bold text-slate-900">{t("forgotTitle")}</h1>
      <p className="mt-1.5 text-sm text-slate-500">{t("forgotSubtitle")}</p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
        {error && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <Input
          label={s("form.email")}
          type="email"
          placeholder={s("placeholder.email")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          autoComplete="email"
        />

        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={loading}>
          {loading ? s("button.sending") : s("button.sendResetLink")}
        </Button>
      </form>
    </div>
  );
}
