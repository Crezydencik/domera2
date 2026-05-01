"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  accountTypeToDashboardRole,
  establishUserSession,
  requestRegistrationCode,
  signUpWithEmailPassword,
  verifyRegistrationCode,
} from "@/shared/lib/auth-client";
import {
  clearPendingRegistration,
  loadPendingRegistration,
  type PendingRegistration,
} from "@/shared/lib/pending-registration";
import { ROUTES } from "@/shared/lib/routes";

const OTP_LENGTH = 6;

export default function RegisterVerifyPage() {
  const t = useTranslations("auth");
  const s = useTranslations("system");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [pending, setPending] = useState<PendingRegistration | null>(null);
  const [codeDigits, setCodeDigits] = useState<string[]>(() => Array.from({ length: OTP_LENGTH }, () => ""));
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const emailFromQuery = searchParams.get("email")?.trim().toLowerCase() ?? "";
  const code = useMemo(() => codeDigits.join(""), [codeDigits]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    const value = loadPendingRegistration();
    if (!value) {
      setPending(null);
      return;
    }

    if (emailFromQuery && value.email !== emailFromQuery) {
      clearPendingRegistration();
      setPending(null);
      return;
    }

    setPending(value);
  }, [emailFromQuery]);

  const resolvedEmail = useMemo(() => pending?.email ?? emailFromQuery, [emailFromQuery, pending?.email]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!pending) {
      setError(t("registerVerificationMissing"));
      return;
    }

    if (!/^\d{6}$/.test(code.trim())) {
      setError(t("registerVerificationInvalidCode"));
      return;
    }

    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      const verified = await verifyRegistrationCode(pending.email, code);
      const verificationToken = verified.verificationToken?.trim();

      if (!verificationToken) {
        throw new Error(t("registerVerificationUnexpected"));
      }

      const result = await signUpWithEmailPassword({
        email: pending.email,
        password: pending.password,
        accountType: pending.accountType,
        verificationToken,
        acceptedPrivacyPolicy: pending.acceptedPrivacyPolicy,
        acceptedTerms: pending.acceptedTerms,
        firstName: pending.firstName,
        lastName: pending.lastName,
        phone: pending.phone,
        companyName: pending.companyName,
        companyEmail: pending.companyEmail,
        registrationNumber: pending.registrationNumber,
      });

      const session = await establishUserSession({
        idToken: result.idToken,
        userId: result.userId,
        email: result.email,
        role: result.role,
        accountType: pending.accountType,
      });

      clearPendingRegistration();
      setDone(true);
      router.push(`${ROUTES.dashboard}?role=${accountTypeToDashboardRole(session.accountType)}`);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : s("dbError"));
    } finally {
      setLoading(false);
    }
  }

  function focusInput(index: number) {
    inputRefs.current[index]?.focus();
    inputRefs.current[index]?.select();
  }

  function updateDigit(index: number, value: string) {
    const normalized = value.replace(/\D/g, "");
    if (!normalized) {
      setCodeDigits((current) => {
        const next = [...current];
        next[index] = "";
        return next;
      });
      return;
    }

    setCodeDigits((current) => {
      const next = [...current];
      const digits = normalized.slice(0, OTP_LENGTH).split("");

      digits.forEach((digit, offset) => {
        const targetIndex = index + offset;
        if (targetIndex < OTP_LENGTH) {
          next[targetIndex] = digit;
        }
      });

      return next;
    });

    const nextIndex = Math.min(index + normalized.length, OTP_LENGTH - 1);
    focusInput(nextIndex);
    setError(null);
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace") {
      if (codeDigits[index]) {
        setCodeDigits((current) => {
          const next = [...current];
          next[index] = "";
          return next;
        });
        return;
      }

      if (index > 0) {
        event.preventDefault();
        setCodeDigits((current) => {
          const next = [...current];
          next[index - 1] = "";
          return next;
        });
        focusInput(index - 1);
      }
      return;
    }

    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      focusInput(index - 1);
      return;
    }

    if (event.key === "ArrowRight" && index < OTP_LENGTH - 1) {
      event.preventDefault();
      focusInput(index + 1);
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;

    setCodeDigits(() => {
      const next = Array.from({ length: OTP_LENGTH }, (_, index) => pasted[index] ?? "");
      return next;
    });

    focusInput(Math.min(pasted.length, OTP_LENGTH) - 1);
    setError(null);
  }

  async function handleResend() {
    if (!pending) {
      setError(t("registerVerificationMissing"));
      return;
    }

    setResending(true);
    setError(null);
    setInfo(null);

    try {
      await requestRegistrationCode(pending.email, locale);
      setInfo(t("registerVerificationResent"));
    } catch (error) {
      setError(error instanceof Error ? error.message : s("dbError"));
    } finally {
      setResending(false);
    }
  }

  if (!pending) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("registerVerificationTitle")}</h1>
        <p className="mt-2 text-sm text-slate-500">{t("registerVerificationMissing")}</p>
        <div className="mt-8">
          <Link href={ROUTES.register}>
            <Button variant="primary" size="lg" className="w-full">
              {s("button.back")}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (done) {
    return null;
  }

  return (
    <div>
      <Link
        href={ROUTES.register}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        {s("button.back")}
      </Link>

      <h1 className="text-2xl font-bold text-slate-900">{t("registerVerificationTitle")}</h1>
      <p className="mt-1.5 text-sm text-slate-500">{t("registerVerificationSubtitle")}</p>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        {t("registerVerificationSentTo", { email: resolvedEmail })}
      </div>

      <form onSubmit={handleVerify} className="mt-8 flex flex-col gap-5">
        {error && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {info && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {info}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700">{t("registerVerificationCodeLabel")}</label>

          <div className="flex items-center justify-between gap-2 sm:gap-3">
            {codeDigits.map((digit, index) => (
              <input
                key={index}
                ref={(element) => {
                  inputRefs.current[index] = element;
                }}
                type="text"
                inputMode="numeric"
                autoComplete={index === 0 ? "one-time-code" : "off"}
                maxLength={1}
                value={digit}
                onChange={(event) => updateDigit(index, event.target.value)}
                onKeyDown={(event) => handleKeyDown(index, event)}
                onPaste={handlePaste}
                onFocus={(event) => event.target.select()}
                aria-label={`${t("registerVerificationCodeLabel")} ${index + 1}`}
                className={`h-14 w-12 rounded-2xl border bg-white text-center text-xl font-semibold text-slate-900 outline-none transition focus:ring-2 sm:h-16 sm:w-14 sm:text-2xl ${
                  error
                    ? "border-red-400 focus:border-red-400 focus:ring-red-100"
                    : "border-blue-300 shadow-sm shadow-blue-100/60 focus:border-blue-500 focus:ring-blue-100"
                }`}
              />
            ))}
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
          {!error && <p className="text-xs text-slate-400">{t("registerVerificationCodeHint")}</p>}
        </div>

        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={loading}>
          {loading ? t("registerVerificationSubmitting") : t("registerVerificationSubmit")}
        </Button>

        <Button type="button" variant="secondary" size="lg" className="w-full" onClick={handleResend} disabled={resending}>
          {resending ? s("button.sending") : t("registerVerificationResend")}
        </Button>
      </form>
    </div>
  );
}
