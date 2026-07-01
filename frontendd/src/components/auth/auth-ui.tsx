import Link from "next/link";
import type { ReactNode } from "react";
import type { IconType } from "react-icons";
import {
  FiAlertCircle,
  FiArrowLeft,
  FiCheck,
  FiCheckCircle,
  FiInfo,
  FiMail,
} from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { getPasswordChecks, getPasswordStrength } from "@/shared/lib/password-validation";

type Tone = "blue" | "green" | "red" | "amber" | "slate";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const toneStyles: Record<Tone, { shell: string; icon: string; text: string }> = {
  blue: {
    shell: "border-blue-100 bg-blue-50/80",
    icon: "bg-blue-100 text-blue-600",
    text: "text-blue-700",
  },
  green: {
    shell: "border-emerald-100 bg-emerald-50/80",
    icon: "bg-emerald-100 text-emerald-600",
    text: "text-emerald-700",
  },
  red: {
    shell: "border-red-100 bg-red-50/80",
    icon: "bg-red-100 text-red-600",
    text: "text-red-700",
  },
  amber: {
    shell: "border-amber-100 bg-amber-50/80",
    icon: "bg-amber-100 text-amber-700",
    text: "text-amber-700",
  },
  slate: {
    shell: "border-slate-200 bg-slate-50/80",
    icon: "bg-slate-100 text-slate-600",
    text: "text-slate-700",
  },
};

export function AuthCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "rounded-[24px] border border-blue-100/80 bg-white/95 p-6 shadow-[0_24px_70px_rgba(37,99,235,0.12)] backdrop-blur sm:p-8",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function AuthHeader({
  eyebrow,
  title,
  subtitle,
  icon: Icon = FiMail,
  className = "",
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  icon?: IconType;
  className?: string;
}) {
  return (
    <div className={cx("mb-7", className)}>
      {eyebrow && (
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
          <Icon className="h-4 w-4 text-blue-600" aria-hidden />
          <span>{eyebrow}</span>
        </div>
      )}
      <h1 className="text-3xl font-bold leading-tight text-slate-950 sm:text-4xl">{title}</h1>
      {subtitle && <p className="mt-3 max-w-md text-base leading-7 text-slate-600">{subtitle}</p>}
    </div>
  );
}

export function AuthAlert({
  children,
  tone = "red",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  const Icon = tone === "green" ? FiCheckCircle : tone === "red" ? FiAlertCircle : FiInfo;

  return (
    <div
      className={cx(
        "flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm leading-6",
        toneStyles[tone].shell,
        toneStyles[tone].text,
        className,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function AuthBackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
    >
      <FiArrowLeft className="h-4 w-4" aria-hidden />
      {children}
    </Link>
  );
}

export function AuthFooterText({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={cx("mt-7 text-center text-sm text-slate-500", className)}>{children}</p>;
}

export function AuthDivider({ label }: { label: string }) {
  return (
    <div className="my-6 flex items-center gap-3">
      <div className="h-px flex-1 bg-slate-200" />
      <span className="text-xs font-medium text-slate-400">{label}</span>
      <div className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

export function AuthResultState({
  icon: Icon = FiCheckCircle,
  tone = "blue",
  title,
  description,
  detail,
  actionHref,
  actionLabel,
}: {
  icon?: IconType;
  tone?: Tone;
  title: string;
  description?: string;
  detail?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <AuthCard className="text-center">
      <div
        className={cx(
          "mx-auto flex h-16 w-16 items-center justify-center rounded-2xl",
          toneStyles[tone].icon,
        )}
      >
        <Icon className="h-8 w-8" aria-hidden />
      </div>
      <h1 className="mt-5 text-2xl font-bold text-slate-950">{title}</h1>
      {description && <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>}
      {detail && <p className="mt-1 text-sm font-semibold text-slate-700">{detail}</p>}
      {actionHref && actionLabel && (
        <div className="mt-8">
          <Link href={actionHref}>
            <Button variant="primary" size="lg" className="min-h-12 w-full rounded-xl">
              {actionLabel}
            </Button>
          </Link>
        </div>
      )}
    </AuthCard>
  );
}

export function AuthInfoBox({
  children,
  tone = "slate",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div className={cx("rounded-2xl border px-4 py-3 text-sm leading-6", toneStyles[tone].shell, className)}>
      {children}
    </div>
  );
}

export function PasswordStrengthPanel({
  password,
  translate,
}: {
  password: string;
  translate: (key: string) => string;
}) {
  if (!password) return null;

  const checks = getPasswordChecks(password);
  const strength = getPasswordStrength(password);
  const strengthColor =
    strength.label === "Strong"
      ? "bg-emerald-500"
      : strength.label === "Medium"
        ? "bg-amber-500"
        : "bg-rose-500";
  const strengthBadge =
    strength.label === "Strong"
      ? "bg-emerald-100 text-emerald-700"
      : strength.label === "Medium"
        ? "bg-amber-100 text-amber-700"
        : "bg-rose-100 text-rose-700";

  const rules = [
    { ok: checks.length, label: translate("passwordRuleLength") },
    { ok: checks.uppercase, label: translate("passwordRuleUppercase") },
    { ok: checks.lowercase, label: translate("passwordRuleLowercase") },
    { ok: checks.number, label: translate("passwordRuleNumber") },
    { ok: checks.symbol, label: translate("passwordRuleSymbol") },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-800">{translate("passwordStrength")}</p>
        <span className={cx("rounded-full px-2.5 py-1 text-xs font-semibold", strengthBadge)}>
          {translate(`passwordStrength${strength.label}`)}
        </span>
      </div>

      <div className="mt-3 flex gap-2">
        {[1, 2, 3, 4, 5].map((item) => (
          <div
            key={item}
            className={cx("h-2 flex-1 rounded-full", strength.score >= item ? strengthColor : "bg-slate-200")}
          />
        ))}
      </div>

      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        {rules.map((rule) => (
          <p key={rule.label} className={rule.ok ? "text-emerald-600" : "text-slate-500"}>
            <FiCheck className="mr-1 inline h-3.5 w-3.5" aria-hidden />
            {rule.label}
          </p>
        ))}
      </div>
    </div>
  );
}

export function StepBar({ current, total, labels }: { current: number; total: number; labels: string[] }) {
  return (
    <div className="mb-6">
      <div className="flex gap-1.5">
        {Array.from({ length: total }).map((_, index) => (
          <div
            key={index}
            className={cx(
              "h-1.5 flex-1 rounded-full transition-all duration-300",
              index <= current ? "bg-blue-600" : "bg-slate-200",
            )}
          />
        ))}
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-400">
        {current + 1} / {total} - {labels[current]}
      </p>
    </div>
  );
}

export function ConfirmRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;

  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-right text-sm font-semibold text-slate-800">{value}</span>
    </div>
  );
}

export { cx };
