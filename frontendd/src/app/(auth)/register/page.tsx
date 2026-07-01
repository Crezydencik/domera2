"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { IconType } from "react-icons";
import {
  FiArrowLeft,
  FiArrowRight,
  FiBriefcase,
  FiHash,
  FiHome,
  FiKey,
  FiLock,
  FiMail,
  FiUser,
} from "react-icons/fi";
import {
  AuthAlert,
  AuthCard,
  AuthFooterText,
  AuthHeader,
  AuthInfoBox,
  ConfirmRow,
  PasswordStrengthPanel,
  StepBar,
  cx,
} from "@/components/auth/auth-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { requestRegistrationCode } from "@/shared/lib/auth-client";
import { apiFetch } from "@/shared/lib/domera-api";
import { savePendingRegistration } from "@/shared/lib/pending-registration";
import { isStrongPassword } from "@/shared/lib/password-validation";
import { ROUTES } from "@/shared/lib/routes";

type AccountType = "ManagementCompany" | "Resident" | "Landlord";

type AccountCatalogResponse = {
  accountTypes?: string[];
};

const DEFAULT_ACCOUNT_TYPES: AccountType[] = ["ManagementCompany", "Resident", "Landlord"];

const ACCOUNT_TYPE_META: Record<
  AccountType,
  {
    icon: IconType;
    titleKey: "accountTypeManager" | "accountTypeResident" | "accountTypeLandlord";
    descriptionKey:
      | "accountTypeManagerDesc"
      | "accountTypeResidentDesc"
      | "accountTypeLandlordDesc";
  }
> = {
  ManagementCompany: {
    icon: FiBriefcase,
    titleKey: "accountTypeManager",
    descriptionKey: "accountTypeManagerDesc",
  },
  Resident: {
    icon: FiHome,
    titleKey: "accountTypeResident",
    descriptionKey: "accountTypeResidentDesc",
  },
  Landlord: {
    icon: FiKey,
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
        // Fallback to local defaults when backend is unavailable.
      });

    return () => {
      isMounted = false;
    };
  }, []);

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  const steps: string[] =
    form.accountType === "ManagementCompany"
      ? [s("steps.accountType"), s("steps.companyInfo"), s("steps.personalInfo"), s("steps.confirmation")]
      : [s("steps.accountType"), s("steps.personalInfo"), s("steps.confirmation")];

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
      if (form.password !== form.confirmPassword) next.confirmPassword = t("passwordsDoNotMatch");
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
    setStep((current) => current + 1);
  }

  function handleBack() {
    setErrors({});
    setStep((current) => current - 1);
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
      <AuthHeader title={t("registerTitle")} subtitle={t("registerSubtitle")} />

      <AuthCard>
        <StepBar current={step} total={steps.length} labels={steps} />

        <form onSubmit={handleSubmit}>
          {errors.general && <AuthAlert className="mb-5">{errors.general}</AuthAlert>}

          {currentKey === "accountType" && (
            <div className="flex flex-col gap-3">
              {availableAccountTypes.map((type) => {
                const meta = ACCOUNT_TYPE_META[type];
                const Icon = meta.icon;
                const selected = form.accountType === type;

                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      update("accountType", type);
                      setErrors({});
                    }}
                    className={cx(
                      "flex items-start gap-4 rounded-2xl border p-4 text-left transition",
                      selected
                        ? "border-blue-500 bg-blue-50 shadow-sm shadow-blue-100"
                        : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/40",
                    )}
                  >
                    <span
                      className={cx(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
                        selected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500",
                      )}
                    >
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span>
                      <span className="block font-semibold text-slate-900">{t(meta.titleKey)}</span>
                      <span className="mt-1 block text-sm leading-6 text-slate-500">{t(meta.descriptionKey)}</span>
                    </span>
                  </button>
                );
              })}
              {errors.accountType && <p className="text-xs text-red-500">{errors.accountType}</p>}
            </div>
          )}

          {currentKey === "companyInfo" && (
            <div className="flex flex-col gap-5">
              <Input
                label={s("form.companyName")}
                placeholder={s("placeholder.companyName")}
                value={form.companyName}
                onChange={(e) => update("companyName", e.target.value)}
                error={errors.companyName}
                autoFocus
                leftIcon={<FiBriefcase className="h-4 w-4" aria-hidden />}
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
                leftIcon={<FiMail className="h-4 w-4" aria-hidden />}
              />
              <Input
                label={s("form.registrationNumber")}
                placeholder="LV40000000000"
                value={form.registrationNumber}
                onChange={(e) => update("registrationNumber", e.target.value)}
                error={errors.registrationNumber}
                leftIcon={<FiHash className="h-4 w-4" aria-hidden />}
              />
            </div>
          )}

          {currentKey === "personalInfo" && (
            <div className="flex flex-col gap-5">
              <div className="grid gap-4 sm:grid-cols-2 sm:gap-3">
                <Input
                  label={s("form.firstName")}
                  placeholder={s("placeholder.firstName")}
                  value={form.firstName}
                  onChange={(e) => update("firstName", e.target.value)}
                  error={errors.firstName}
                  autoFocus
                  leftIcon={<FiUser className="h-4 w-4" aria-hidden />}
                />
                <Input
                  label={s("form.lastName")}
                  placeholder={s("placeholder.lastName")}
                  value={form.lastName}
                  onChange={(e) => update("lastName", e.target.value)}
                  error={errors.lastName}
                  leftIcon={<FiUser className="h-4 w-4" aria-hidden />}
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
                leftIcon={<FiMail className="h-4 w-4" aria-hidden />}
              />
              <PhoneInput
                label={s("form.phone")}
                placeholder={s("placeholder.phone")}
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                error={errors.phone}
              />
              <Input
                label={s("form.password")}
                showToggle
                placeholder="********"
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                error={errors.password}
                hint={s("form.passwordHint")}
                autoComplete="new-password"
                leftIcon={<FiLock className="h-4 w-4" aria-hidden />}
              />

              <PasswordStrengthPanel password={form.password} translate={t} />

              <Input
                label={s("form.confirmPassword")}
                showToggle
                placeholder="********"
                value={form.confirmPassword}
                onChange={(e) => update("confirmPassword", e.target.value)}
                error={errors.confirmPassword}
                autoComplete="new-password"
                leftIcon={<FiLock className="h-4 w-4" aria-hidden />}
              />
            </div>
          )}

          {currentKey === "confirmation" && (
            <div className="space-y-5">
              <AuthInfoBox>
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
              </AuthInfoBox>

              <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
                <input
                  id="legal-consent"
                  type="checkbox"
                  checked={hasAcceptedLegal}
                  onChange={(event) => setHasAcceptedLegal(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>
                  {t("registerLegalConsentPrefix")}{" "}
                  <a
                    href={ROUTES.privacyPolicy}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {t("privacyPolicyTitle")}
                  </a>{" "}
                  {t("registerLegalConsentAnd")}{" "}
                  <a
                    href={ROUTES.termsOfUse}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {t("termsOfUseTitle")}
                  </a>
                  .
                </span>
              </label>

              {!hasAcceptedLegal && <p className="text-xs text-slate-500">{t("registerLegalConsentHint")}</p>}
            </div>
          )}

          <div className={cx("mt-8 flex gap-3", step > 0 ? "justify-between" : "justify-end")}>
            {step > 0 && (
              <Button type="button" variant="secondary" onClick={handleBack} className="min-h-12 rounded-xl">
                <FiArrowLeft className="h-4 w-4" aria-hidden />
                {s("button.back")}
              </Button>
            )}
            {!isLastStep ? (
              <Button
                type="button"
                variant="primary"
                onClick={handleNext}
                className="min-h-12 flex-1 rounded-xl sm:min-w-36 sm:flex-none"
              >
                {s("button.next")}
                <FiArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            ) : (
              <Button
                type="submit"
                variant="primary"
                className="min-h-12 flex-1 rounded-xl sm:min-w-36 sm:flex-none"
                disabled={loading || !hasAcceptedLegal}
              >
                {loading ? s("button.registering") : s("button.register")}
                {!loading && <FiArrowRight className="h-4 w-4" aria-hidden />}
              </Button>
            )}
          </div>
        </form>
      </AuthCard>

      <AuthFooterText>
        {t("haveAccount")}{" "}
        <Link href={ROUTES.login} className="font-medium text-blue-600 hover:underline">
          {s("button.login")}
        </Link>
      </AuthFooterText>
    </div>
  );
}
