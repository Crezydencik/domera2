"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { FiArrowRight, FiLock, FiMail } from "react-icons/fi";
import { AuthAlert, AuthCard, AuthFooterText, AuthHeader } from "@/components/auth/auth-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { establishUserSession, signInWithEmailPassword } from "@/shared/lib/auth-client";
import { ROUTES } from "@/shared/lib/routes";

export default function LoginPage() {
  const t = useTranslations("auth");
  const s = useTranslations("system");
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function getLoginErrorMessage(message: string) {
    const normalized = message.trim().toLowerCase().replace(/\.$/, "");

    if (
      normalized === "incorrect email or password" ||
      normalized === "invalid email or password" ||
      normalized === "user account was not found"
    ) {
      return t("invalidEmailOrPassword");
    }

    return message || s("dbError");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await signInWithEmailPassword(email, password, rememberMe);

      await establishUserSession({
        idToken: result.idToken,
        userId: result.userId,
        email: result.email,
        role: result.role,
        accountType: result.accountType,
        companyId: result.companyId,
        apartmentId: result.apartmentId,
        rememberMe,
      });

      const nextPath = searchParams.get("next");
      router.push(nextPath && nextPath.startsWith("/") ? nextPath : ROUTES.dashboard);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? getLoginErrorMessage(error.message) : s("dbError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <AuthHeader title={t("loginTitle")} subtitle={t("loginSubtitle")} />

      <AuthCard>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {error && <AuthAlert>{error}</AuthAlert>}

          <Input
            label={s("form.email")}
            type="email"
            placeholder={s("placeholder.email")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            leftIcon={<FiMail className="h-4 w-4" aria-hidden />}
          />

          <div>
            <Input
              label={s("form.password")}
              showToggle
              placeholder="********"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              leftIcon={<FiLock className="h-4 w-4" aria-hidden />}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
              <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                />
                {t("rememberMe")}
              </label>
              <Link
                href={ROUTES.forgotPassword}
                className="text-sm font-medium text-blue-600 transition hover:text-blue-700 hover:underline"
              >
                {s("button.forgotPassword")}
              </Link>
            </div>
          </div>

          <Button type="submit" variant="primary" size="lg" className="min-h-12 w-full rounded-xl" disabled={loading}>
            {loading ? s("button.loggingIn") : s("button.login")}
            {!loading && <FiArrowRight className="h-4 w-4" aria-hidden />}
          </Button>
        </form>
      </AuthCard>

      <AuthFooterText>
        {t("noAccount")}{" "}
        <Link href={ROUTES.register} className="font-medium text-blue-600 hover:underline">
          {s("button.register")}
        </Link>
      </AuthFooterText>
    </div>
  );
}
