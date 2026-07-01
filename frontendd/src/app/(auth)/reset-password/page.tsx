"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FiArrowRight, FiCheckCircle, FiKey, FiLock } from "react-icons/fi";
import {
  AuthAlert,
  AuthCard,
  AuthHeader,
  AuthInfoBox,
  AuthResultState,
  PasswordStrengthPanel,
} from "@/components/auth/auth-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmPasswordReset } from "@/shared/lib/auth-client";
import { apiFetch } from "@/shared/lib/domera-api";
import { isStrongPassword } from "@/shared/lib/password-validation";
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
        // Submit flow handles invalid links.
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
      <AuthResultState
        icon={FiCheckCircle}
        tone="green"
        title={s("button.saveNewPassword")}
        description={s("rememberPassword")}
        actionHref={ROUTES.login}
        actionLabel={s("button.login")}
      />
    );
  }

  return (
    <div>
      <AuthHeader title={t("resetTitle")} subtitle={t("resetSubtitle")} icon={FiKey} />

      <AuthCard>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {errors.general && <AuthAlert>{errors.general}</AuthAlert>}

          {oobCode && (
            <AuthInfoBox>{resolvedEmail ? t("resetForUser", { email: resolvedEmail }) : t("resetForYourAccount")}</AuthInfoBox>
          )}

          <Input
            ref={passwordRef}
            label={s("form.password")}
            showToggle
            placeholder="********"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
            error={errors.password}
            hint={s("form.passwordHint")}
            autoFocus
            autoComplete="new-password"
            leftIcon={<FiLock className="h-4 w-4" aria-hidden />}
          />

          <PasswordStrengthPanel password={password} translate={t} />

          <Input
            ref={confirmRef}
            label={s("form.confirmPassword")}
            showToggle
            placeholder="********"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onInput={(e) => setConfirm((e.target as HTMLInputElement).value)}
            error={errors.confirm}
            autoComplete="new-password"
            leftIcon={<FiLock className="h-4 w-4" aria-hidden />}
          />

          <Button type="submit" variant="primary" size="lg" className="min-h-12 w-full rounded-xl" disabled={loading}>
            {loading ? s("button.sending") : s("button.saveNewPassword")}
            {!loading && <FiArrowRight className="h-4 w-4" aria-hidden />}
          </Button>
        </form>
      </AuthCard>

      <p className="mt-7 text-center text-sm text-slate-500">
        <Link href={ROUTES.login} className="font-medium text-blue-600 hover:underline">
          {s("button.backToLogin")}
        </Link>
      </p>
    </div>
  );
}
