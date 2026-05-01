"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  requestRegistrationCode,
} from "@/shared/lib/auth-client";
import { apiFetch } from "@/shared/lib/domera-api";
import { savePendingRegistration } from "@/shared/lib/pending-registration";
import { getPasswordChecks, getPasswordStrength, isStrongPassword } from "@/shared/lib/password-validation";
import { ROUTES } from "@/shared/lib/routes";

type AccountType = "ManagementCompany" | "Resident" | "Landlord";

type AccountCatalogResponse = {
  accountTypes?: string[];
};

const DEFAULT_ACCOUNT_TYPES: AccountType[] = ["ManagementCompany", "Resident", "Landlord"];

const ACCOUNT_TYPE_META: Record<
  AccountType,
  {
    icon: string;
    titleKey: "accountTypeManager" | "accountTypeResident" | "accountTypeLandlord";
    descriptionKey:
      | "accountTypeManagerDesc"
      | "accountTypeResidentDesc"
      | "accountTypeLandlordDesc";
  }
> = {
  ManagementCompany: {
    icon: "🏢",
    titleKey: "accountTypeManager",
    descriptionKey: "accountTypeManagerDesc",
  },
  Resident: {
    icon: "🏠",
    titleKey: "accountTypeResident",
    descriptionKey: "accountTypeResidentDesc",
  },
  Landlord: {
    icon: "🔑",
    titleKey: "accountTypeLandlord",
    descriptionKey: "accountTypeLandlordDesc",
  },
};

interface FormData {
  accountType: AccountType | null;
  companyName: string;
  companyEmail: string;
  registrationNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
}

type FormErrors = Partial<Record<keyof FormData | "general", string>>;

const EMPTY_FORM: FormData = {
  accountType: null,
  companyName: "",
  companyEmail: "",
  registrationNumber: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  password: "",
  confirmPassword: "",
};

function StepBar({ current, total, labels }: { current: number; total: number; labels: string[] }) {
  return (
    <div className="mb-7">
      <div className="flex gap-1.5">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i <= current ? "bg-blue-600" : "bg-slate-200"}`}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-400">
        {current + 1} / {total} — {labels[current]}
      </p>
    </div>
  );
}

function ConfirmRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-right text-sm font-medium text-slate-800">{value}</span>
    </div>
  );
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function RegisterPage() {
  const t = useTranslations("auth");
  const s = useTranslations("system");
  const locale = useLocale();
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [availableAccountTypes, setAvailableAccountTypes] = useState<AccountType[]>(DEFAULT_ACCOUNT_TYPES);
  const [hasAcceptedLegal, setHasAcceptedLegal] = useState(false);

  const checks = getPasswordChecks(form.password);
  const strength = getPasswordStrength(form.password);

  useEffect(() => {
    let isMounted = true;

    apiFetch<AccountCatalogResponse>("/auth/account-catalog")
      .then((data) => {
        const next = (data.accountTypes ?? []).filter(
          (value): value is AccountType => DEFAULT_ACCOUNT_TYPES.includes(value as AccountType),
        );

        if (isMounted && next.length > 0) {
          setAvailableAccountTypes(next);
        }
      })
      .catch(() => {
        // fallback to local defaults when backend is unavailable
      });

    return () => {
      isMounted = false;
    };
  }, []);

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  // Steps vary by account type
  const steps: string[] =
    form.accountType === "ManagementCompany"
      ? [s("steps.accountType"), s("steps.companyInfo"), s("steps.personalInfo"), s("steps.confirmation")]
      : [s("steps.accountType"), s("steps.personalInfo"), s("steps.confirmation")];

  // Logical content to show at each step
  type StepKey = "accountType" | "companyInfo" | "personalInfo" | "confirmation";
  const stepKeys: StepKey[] =
    form.accountType === "ManagementCompany"
      ? ["accountType", "companyInfo", "personalInfo", "confirmation"]
      : ["accountType", "personalInfo", "confirmation"];

  const currentKey = stepKeys[step] ?? "accountType";

  function validate(): boolean {
    const next: FormErrors = {};

    if (currentKey === "accountType" && !form.accountType) {
      next.accountType = "Required";
    }
    if (currentKey === "companyInfo") {
      if (!form.companyName.trim()) next.companyName = "Required";
      if (form.companyEmail.trim() && !isValidEmail(form.companyEmail)) next.companyEmail = "Invalid email";
      if (!form.registrationNumber.trim()) next.registrationNumber = "Required";
    }
    if (currentKey === "personalInfo") {
      if (!form.firstName.trim()) next.firstName = "Required";
      if (!form.lastName.trim()) next.lastName = "Required";
      if (!form.email.trim()) next.email = "Required";
      if (!isStrongPassword(form.password)) next.password = s("form.passwordHint");
      if (form.password !== form.confirmPassword)
        next.confirmPassword = "Passwords do not match";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleNext() {
    if (!validate()) return;
    const nextStep = step + 1;
    if (stepKeys[nextStep] === "confirmation") {
      setHasAcceptedLegal(false);
    }
    setStep((n) => n + 1);
  }

  function handleBack() {
    setErrors({});
    setStep((n) => n - 1);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasAcceptedLegal) return;
    setLoading(true);
    setErrors({});

    try {
      const selectedAccountType = form.accountType ?? "Resident";
      const normalizedEmail = form.email.trim().toLowerCase();

      await requestRegistrationCode(normalizedEmail, locale);
      savePendingRegistration({
        email: normalizedEmail,
        password: form.password,
        accountType: selectedAccountType,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        companyName: form.companyName.trim(),
        companyEmail: form.companyEmail.trim().toLowerCase(),
        registrationNumber: form.registrationNumber.trim(),
        acceptedPrivacyPolicy: true,
        acceptedTerms: true,
      });
      router.push(`${ROUTES.registerVerify}?email=${encodeURIComponent(normalizedEmail)}`);
    } catch (error) {
      setErrors({ general: error instanceof Error ? error.message : s("dbError") });
    } finally {
      setLoading(false);
    }
  }

  const isLastStep = step === steps.length - 1;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">{t("registerTitle")}</h1>
      <p className="mt-1.5 text-sm text-slate-500">{t("registerSubtitle")}</p>

      <div className="mt-7">
        <StepBar current={step} total={steps.length} labels={steps} />
      </div>

      <form onSubmit={handleSubmit}>
        {errors.general && (
          <div className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {errors.general}
          </div>
        )}

        {/* ── STEP: Account type ── */}
        {currentKey === "accountType" && (
          <div className="flex flex-col gap-4">
            {availableAccountTypes.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => {
                  update("accountType", type);
                  setErrors({});
                }}
                className={`flex items-start gap-4 rounded-2xl border-2 p-5 text-left transition ${
                  form.accountType === type
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl ${
                    form.accountType === type ? "bg-blue-100" : "bg-slate-100"
                  }`}
                >
                  {ACCOUNT_TYPE_META[type].icon}
                </span>
                <div>
                  <p className="font-semibold text-slate-800">
                    {t(ACCOUNT_TYPE_META[type].titleKey)}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {t(ACCOUNT_TYPE_META[type].descriptionKey)}
                  </p>
                </div>
              </button>
            ))}
            {errors.accountType && (
              <p className="text-xs text-red-500">{errors.accountType}</p>
            )}
          </div>
        )}

        {/* ── STEP: Company info ── */}
        {currentKey === "companyInfo" && (
          <div className="flex flex-col gap-5">
            <Input
              label={s("form.companyName")}
              placeholder={s("placeholder.companyName")}
              value={form.companyName}
              onChange={(e) => update("companyName", e.target.value)}
              error={errors.companyName}
              autoFocus
            />
            <Input
              label={s("form.companyEmail")}
              type="email"
              placeholder={s("placeholder.companyEmail")}
              value={form.companyEmail}
              onChange={(e) => update("companyEmail", e.target.value)}
              error={errors.companyEmail}
              hint={t("registerCompanyEmailHint")}
              autoComplete="email"
            />
            <Input
              label={s("form.registrationNumber")}
              placeholder="LV40000000000"
              value={form.registrationNumber}
              onChange={(e) => update("registrationNumber", e.target.value)}
              error={errors.registrationNumber}
            />
          </div>
        )}

        {/* ── STEP: Personal info ── */}
        {currentKey === "personalInfo" && (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label={s("form.firstName")}
                placeholder={s("placeholder.firstName")}
                value={form.firstName}
                onChange={(e) => update("firstName", e.target.value)}
                error={errors.firstName}
                autoFocus
              />
              <Input
                label={s("form.lastName")}
                placeholder={s("placeholder.lastName")}
                value={form.lastName}
                onChange={(e) => update("lastName", e.target.value)}
                error={errors.lastName}
              />
            </div>
            <Input
              label={s("form.email")}
              type="email"
              placeholder={s("placeholder.email")}
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              error={errors.email}
              autoComplete="email"
            />
            <Input
              label={s("form.phone")}
              type="tel"
              placeholder={s("placeholder.phone")}
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              error={errors.phone}
            />
            <Input
              label={s("form.password")}
              showToggle
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              error={errors.password}
              hint={s("form.passwordHint")}
              autoComplete="new-password"
            />

            {!!form.password && (
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
              label={s("form.confirmPassword")}
              showToggle
              placeholder="••••••••"
              value={form.confirmPassword}
              onChange={(e) => update("confirmPassword", e.target.value)}
              error={errors.confirmPassword}
              autoComplete="new-password"
            />
          </div>
        )}

        {/* ── STEP: Confirmation ── */}
        {currentKey === "confirmation" && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
              <div className="divide-y divide-slate-100">
                <ConfirmRow label={s("form.firstName")} value={form.firstName} />
                <ConfirmRow label={s("form.lastName")} value={form.lastName} />
                <ConfirmRow label={s("form.email")} value={form.email} />
                {form.phone && <ConfirmRow label={s("form.phone")} value={form.phone} />}
                {form.accountType === "ManagementCompany" && (
                  <>
                    <ConfirmRow label={s("form.companyName")} value={form.companyName} />
                    <ConfirmRow label={s("form.companyEmail")} value={form.companyEmail} />
                    <ConfirmRow label={s("form.registrationNumber")} value={form.registrationNumber} />
                  </>
                )}
              </div>
            </div>

            <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={hasAcceptedLegal}
                onChange={(event) => setHasAcceptedLegal(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>
                {t("registerLegalConsentPrefix")}{" "}
                <Link href={ROUTES.privacyPolicy} target="_blank" className="font-medium text-blue-600 hover:underline">
                  {t("privacyPolicyTitle")}
                </Link>{" "}
                {t("registerLegalConsentAnd")}{" "}
                <Link href={ROUTES.termsOfUse} target="_blank" className="font-medium text-blue-600 hover:underline">
                  {t("termsOfUseTitle")}
                </Link>
                .
              </span>
            </label>

            {!hasAcceptedLegal && (
              <p className="text-xs text-slate-500">{t("registerLegalConsentHint")}</p>
            )}
          </div>
        )}

        {/* ── Navigation ── */}
        <div className={`mt-8 flex gap-3 ${step > 0 ? "justify-between" : "justify-end"}`}>
          {step > 0 && (
            <Button type="button" variant="secondary" onClick={handleBack}>
              {s("button.back")}
            </Button>
          )}
          {!isLastStep ? (
            <Button
              type="button"
              variant="primary"
              onClick={handleNext}
              className="flex-1 sm:flex-none sm:min-w-35"
            >
              {s("button.next")}
            </Button>
          ) : (
            <Button
              type="submit"
              variant="primary"
              className="flex-1 sm:flex-none sm:min-w-35"
              disabled={loading || !hasAcceptedLegal}
            >
              {loading ? s("button.registering") : s("button.register")}
            </Button>
          )}
        </div>
      </form>

      <p className="mt-8 text-center text-sm text-slate-500">
        {t("haveAccount")}{" "}
        <Link href={ROUTES.login} className="font-medium text-blue-600 hover:underline">
          {s("button.login")}
        </Link>
      </p>
    </div>
  );
}
