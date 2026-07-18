"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { FcGoogle } from "react-icons/fc";
import { FiArrowRight, FiLock, FiMail } from "react-icons/fi";
import { AuthAlert, AuthCard, AuthFooterText, AuthHeader } from "@/components/auth/auth-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  completeGoogleRedirectSignIn,
  establishUserSession,
  signInWithEmailPassword,
  signInWithGoogle,
} from "@/shared/lib/auth-client";
import { ROUTES } from "@/shared/lib/routes";

export default function LoginPage() {
  const t = useTranslations("auth");
  const s = useTranslations("system");
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getLoginErrorMessage = useCallback((message: string) => {
    const normalized = message.trim().toLowerCase().replace(/\.$/, "");

    if (
      normalized === "incorrect email or password" ||
      normalized === "invalid email or password" ||
      normalized === "user account was not found"
    ) {
      return t("invalidEmailOrPassword");
    }

    if (
      normalized.includes("popup-closed-by-user") ||
      normalized.includes("cancelled-popup-request") ||
      normalized.includes("popup closed")
    ) {
      return t("googleSignInCancelled");
    }

    if (normalized.includes("firebase client config is missing") || normalized.includes("google sign-in is not configured")) {
      return t("googleSignInUnavailable");
    }

    if (normalized.includes("google sign-in returned without an authenticated firebase user")) {
      return t("googleSignInNotCompleted");
    }

    return message || s("dbError");
  }, [s, t]);

  const completeLogin = useCallback(async (result: Awaited<ReturnType<typeof signInWithEmailPassword>>) => {
    await establishUserSession({
      userId: result.userId,
      email: result.email,
      role: result.role,
      accountType: result.accountType,
      companyId: result.companyId,
      apartmentId: result.apartmentId,
      rememberMe: result.rememberMe ?? rememberMe,
    });

    const nextPath = searchParams.get("next");
    const redirectPath =
      nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : ROUTES.dashboard;

    window.location.replace(redirectPath);
  }, [rememberMe, searchParams]);

  useEffect(() => {
    let mounted = true;

    async function finishRedirectSignIn() {
      setGoogleLoading(true);
      setError(null);

      try {
        const result = await completeGoogleRedirectSignIn();
        if (!mounted) return;

        if (result) {
          await completeLogin(result);
        }
      } catch (error) {
        if (mounted) {
          setError(error instanceof Error ? getLoginErrorMessage(error.message) : s("dbError"));
        }
      } finally {
        if (mounted) {
          setGoogleLoading(false);
        }
      }
    }

    void finishRedirectSignIn();

    return () => {
      mounted = false;
    };
  }, [completeLogin, getLoginErrorMessage, s]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await completeLogin(await signInWithEmailPassword(email, password, rememberMe));
    } catch (error) {
      setError(error instanceof Error ? getLoginErrorMessage(error.message) : s("dbError"));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    setError(null);

    try {
      await completeLogin(await signInWithGoogle(rememberMe));
    } catch (error) {
      setError(error instanceof Error ? getLoginErrorMessage(error.message) : s("dbError"));
    } finally {
      setGoogleLoading(false);
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

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="min-h-12 w-full rounded-xl"
            disabled={loading || googleLoading}
          >
            {loading ? s("button.loggingIn") : s("button.login")}
            {!loading && <FiArrowRight className="h-4 w-4" aria-hidden />}
          </Button>

          <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            <span>{t("or")}</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <Button
            type="button"
            variant="outlineDark"
            size="lg"
            className="min-h-12 w-full rounded-xl border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
            disabled={loading || googleLoading}
            onClick={handleGoogleSignIn}
          >
            <FcGoogle className="h-5 w-5" aria-hidden />
            {googleLoading ? t("googleSigningIn") : t("continueWithGoogle")}
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
