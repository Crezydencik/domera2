"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmPasswordReset } from "@/shared/lib/auth-client";
import { apiFetch } from "@/shared/lib/domera-api";
import { getPasswordChecks, getPasswordStrength, isStrongPassword } from "@/shared/lib/password-validation";
import { ROUTES } from "@/shared/lib/routes";

export default function ResetPasswordPage() {
  const t = useTranslations("auth");
  const s = useTranslations("system");
  const searchParams = useSearchParams();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; general?: string }>({});
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  const oobCode = searchParams.get("oobCode");
  const resetEmail = searchParams.get("email")?.trim() ?? "";
  const [resolvedEmail, setResolvedEmail] = useState("");
  const checks = getPasswordChecks(password);
  const strength = getPasswordStrength(password);

  useEffect(() => {
    const storedEmail =
      resetEmail ||
      (typeof document !== "undefined"
        ? decodeURIComponent(
            document.cookie.match(/(?:^|; )domera_reset_email=([^;]*)/)?.[1] ??
              document.cookie.match(/(?:^|; )userEmail=([^;]*)/)?.[1] ??
              "",
          )
        : "") ||
      (typeof window !== "undefined" ? window.localStorage.getItem("domera_reset_email") ?? "" : "");

    if (storedEmail && !resolvedEmail) {
      setResolvedEmail(storedEmail);
    }

    if (passwordRef.current?.value) {
      setPassword(passwordRef.current.value);
    }

    if (confirmRef.current?.value) {
      setConfirm(confirmRef.current.value);
    }
  }, [resetEmail, resolvedEmail]);

  useEffect(() => {
    if (resolvedEmail || !oobCode) {
      return;
    }

    let active = true;

    apiFetch<{ email?: string }>("/auth/preview-password-reset", {
      method: "POST",
      body: JSON.stringify({ oobCode }),
    })
      .then((data) => {
        if (active && data.email) {
          setResolvedEmail(data.email);

          if (typeof window !== "undefined") {
            window.localStorage.setItem("domera_reset_email", data.email);
            document.cookie = `domera_reset_email=${encodeURIComponent(data.email)}; max-age=${60 * 60}; path=/; SameSite=Lax`;
          }
        }
      })
      .catch(() => {
        // Ignore preview errors here; submit flow already handles invalid links.
      });

    return () => {
      active = false;
    };
  }, [resolvedEmail, oobCode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};

    if (!isStrongPassword(password)) next.password = s("form.passwordHint");
    if (password !== confirm) next.confirm = t("passwordsDoNotMatch");
    if (!oobCode) next.general = t("resetLinkInvalid");
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }

    setLoading(true);
    setErrors({});
    try {
      await confirmPasswordReset(oobCode as string, password);
      setDone(true);
    } catch (error) {
      setErrors({ general: error instanceof Error ? error.message : s("dbError") });
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-green-50">
          <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="mt-5 text-2xl font-bold text-slate-900">{s("button.saveNewPassword")}</h1>
        <p className="mt-2 text-sm text-slate-500">{s("rememberPassword")}</p>
        <div className="mt-8">
          <Link href={ROUTES.login}>
            <Button variant="primary" size="lg" className="w-full">
              {s("button.login")}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">{t("resetTitle")}</h1>
      <p className="mt-1.5 text-sm text-slate-500">{t("resetSubtitle")}</p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
        {errors.general && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {errors.general}
          </div>
        )}

        {oobCode && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {resolvedEmail ? t("resetForUser", { email: resolvedEmail }) : t("resetForYourAccount")}
          </div>
        )}

        <Input
          ref={passwordRef}
          label={s("form.password")}
          showToggle
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
          error={errors.password}
          hint={s("form.passwordHint")}
          autoFocus
          autoComplete="new-password"
        />

        {!!password && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-slate-800">{t("passwordStrength")}</p>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  strength.label === "Strong"
                    ? "bg-emerald-100 text-emerald-700"
                    : strength.label === "Medium"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-rose-100 text-rose-700"
                }`}
              >
                {t(`passwordStrength${strength.label}`)}
              </span>
            </div>

            <div className="mt-3 flex gap-2">
              {[1, 2, 3, 4, 5].map((item) => (
                <div
                  key={item}
                  className={`h-2 flex-1 rounded-full ${
                    strength.score >= item
                      ? strength.label === "Strong"
                        ? "bg-emerald-500"
                        : strength.label === "Medium"
                          ? "bg-amber-500"
                          : "bg-rose-500"
                      : "bg-slate-200"
                  }`}
                />
              ))}
            </div>

            <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
              <p className={checks.length ? "text-emerald-600" : "text-slate-500"}>• {t("passwordRuleLength")}</p>
              <p className={checks.uppercase ? "text-emerald-600" : "text-slate-500"}>• {t("passwordRuleUppercase")}</p>
              <p className={checks.lowercase ? "text-emerald-600" : "text-slate-500"}>• {t("passwordRuleLowercase")}</p>
              <p className={checks.number ? "text-emerald-600" : "text-slate-500"}>• {t("passwordRuleNumber")}</p>
              <p className={checks.symbol ? "text-emerald-600" : "text-slate-500"}>• {t("passwordRuleSymbol")}</p>
            </div>
          </div>
        )}

        <Input
          ref={confirmRef}
          label={s("form.confirmPassword")}
          showToggle
          placeholder="••••••••"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onInput={(e) => setConfirm((e.target as HTMLInputElement).value)}
          error={errors.confirm}
          autoComplete="new-password"
        />

        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={loading}>
          {loading ? s("button.sending") : s("button.saveNewPassword")}
        </Button>
      </form>
    </div>
  );
}
