"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { FiArrowRight, FiKey, FiMail } from "react-icons/fi";
import { AuthAlert, AuthBackLink, AuthCard, AuthHeader, AuthResultState } from "@/components/auth/auth-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DomeraApiError, apiFetch } from "@/shared/api/client";
import { ROUTES } from "@/shared/lib/routes";

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
      <AuthResultState
        icon={FiMail}
        tone="blue"
        title={t("checkEmail")}
        description={t("checkEmailDesc")}
        detail={email}
        actionHref={ROUTES.login}
        actionLabel={s("button.backToLogin")}
      />
    );
  }

  return (
    <div>
      <AuthBackLink href={ROUTES.login}>{s("button.backToLogin")}</AuthBackLink>
      <AuthHeader title={t("forgotTitle")} subtitle={t("forgotSubtitle")} icon={FiKey} />

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
            autoFocus
            autoComplete="email"
            leftIcon={<FiMail className="h-4 w-4" aria-hidden />}
          />

          <Button type="submit" variant="primary" size="lg" className="min-h-12 w-full rounded-xl" disabled={loading}>
            {loading ? s("button.sending") : s("button.sendResetLink")}
            {!loading && <FiArrowRight className="h-4 w-4" aria-hidden />}
          </Button>
        </form>
      </AuthCard>
    </div>
  );
}
