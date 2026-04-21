"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { accountTypeToDashboardRole, establishUserSession, signInWithEmailPassword } from "@/shared/lib/auth-client";
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await signInWithEmailPassword(email, password);

      const session = await establishUserSession({
        idToken: result.idToken,
        userId: result.userId,
        email: result.email,
        accountType: result.accountType,
        rememberMe,
      });

      const nextPath = searchParams.get("next");
      const fallbackPath = `${ROUTES.dashboard}?role=${accountTypeToDashboardRole(session.accountType)}`;

      router.push(nextPath && nextPath.startsWith("/") ? nextPath : fallbackPath);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : s("dbError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">{t("loginTitle")}</h1>
      <p className="mt-1.5 text-sm text-slate-500">{t("loginSubtitle")}</p>

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
          autoComplete="email"
        />

        <div>
          <Input
            label={s("form.password")}
            showToggle
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <div className="mt-3 flex items-center justify-between">
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
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              {s("button.forgotPassword")}
            </Link>
          </div>
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          disabled={loading}
        >
          {loading ? s("button.loggingIn") : s("button.login")}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="text-xs text-slate-400">{t("or")}</span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      <p className="text-center text-sm text-slate-500">
        {t("noAccount")}{" "}
        <Link href={ROUTES.register} className="font-medium text-blue-600 hover:underline">
          {s("button.register")}
        </Link>
      </p>
    </div>
  );
}
