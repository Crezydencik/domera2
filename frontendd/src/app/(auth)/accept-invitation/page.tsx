"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  accountTypeToDashboardRole,
  establishUserSession,
  saveUserProfile,
  signUpWithEmailPassword,
} from "@/shared/lib/auth-client";
import { apiFetch } from "@/shared/lib/domera-api";
import { isStrongPassword } from "@/shared/lib/password-validation";
import { ROUTES } from "@/shared/lib/routes";

interface InvitationInfo {
  id: string;
  email: string;
  apartment: string;
  building: string;
  managerName: string;
  apartmentId?: string;
  token: string;
  existingAccountDetected?: boolean;
}

function AcceptInvitationContent() {
  const t = useTranslations("auth");
  const s = useTranslations("system");
  const params = useSearchParams();
  const router = useRouter();

  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [resolving, setResolving] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const token = params.get("token");

    if (!token) {
      setInfo(null);
      setResolving(false);
      return;
    }

    apiFetch<{
      invitation?: { id?: string; email?: string; apartmentId?: string | null };
      existingAccountDetected?: boolean;
    }>(`/invitations/resolve?token=${encodeURIComponent(token)}`)
      .then((data) => {
        const invitation = data.invitation;
        if (!invitation?.id || !invitation?.email) {
          setInfo(null);
          return;
        }

        setInfo({
          id: invitation.id,
          email: invitation.email,
          apartment: invitation.apartmentId ?? "Assigned apartment",
          building: "Domera building",
          managerName: "Domera Manager",
          apartmentId: invitation.apartmentId ?? undefined,
          token,
          existingAccountDetected: data.existingAccountDetected,
        });
      })
      .catch(() => setInfo(null))
      .finally(() => setResolving(false));
  }, [params]);

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!firstName.trim()) next.firstName = "Required";
    if (!lastName.trim()) next.lastName = "Required";
    if (!isStrongPassword(password)) next.password = s("form.passwordHint");
    if (password !== confirm) next.confirm = "Passwords do not match";
    if (Object.keys(next).length) { setErrors(next); return; }

    setLoading(true);
    setErrors({});
    try {
      if (!info) {
        throw new Error("Invitation is invalid.");
      }

      const result = await signUpWithEmailPassword(info.email, password, "Resident");

      await establishUserSession({
        idToken: result.idToken,
        userId: result.userId,
        email: result.email,
        accountType: "Resident",
      });

      await saveUserProfile(result.userId, {
        email: result.email,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        fullName: `${firstName} ${lastName}`.trim(),
        role: "Resident",
        accountType: "Resident",
        apartmentId: info.apartmentId,
      });

      await apiFetch("/invitations/accept", {
        method: "POST",
        body: JSON.stringify({ token: info.token, gdprConsent: true }),
      });

      setAccepted(true);
      router.push(`${ROUTES.dashboard}?role=${accountTypeToDashboardRole("Resident")}`);
      router.refresh();
    } catch (error) {
      setErrors({ general: error instanceof Error ? error.message : s("dbError") });
    } finally {
      setLoading(false);
    }
  }

  if (resolving) {
    return <div className="text-sm text-slate-500">{s("loading")}</div>;
  }

  if (!info) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50">
          <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="mt-5 text-xl font-bold text-slate-900">{t("invitationExpired")}</h1>
        <div className="mt-6">
          <Link href={ROUTES.login}>
            <Button variant="secondary">{s("button.backToLogin")}</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-green-50">
          <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="mt-5 text-2xl font-bold text-slate-900">{t("invitationTitle")}</h1>
        <p className="mt-2 text-sm text-slate-500">{t("invitationSubtitle")}</p>
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
      <h1 className="text-2xl font-bold text-slate-900">{t("invitationTitle")}</h1>
      <p className="mt-1.5 text-sm text-slate-500">{t("invitationSubtitle")}</p>

      {/* Invitation card */}
      <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-5">
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">{t("invitationApartment")}</span>
            <span className="font-semibold text-slate-800">{info.apartment}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">{t("invitationBuilding")}</span>
            <span className="font-semibold text-slate-800">{info.building}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">{t("invitationFrom")}</span>
            <span className="font-semibold text-slate-800">{info.managerName}</span>
          </div>
        </div>
      </div>

      {info.existingAccountDetected && (
        <div className="mt-6 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          This invitation email already has an account. Please sign in first to continue.
        </div>
      )}

      {/* Registration form */}
      <form onSubmit={handleAccept} className="mt-6 flex flex-col gap-5">
        {errors.general && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {errors.general}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input
            label={s("form.firstName")}
            placeholder={s("placeholder.firstName")}
            value={firstName}
            onChange={(e) => { setFirstName(e.target.value); setErrors((p) => ({ ...p, firstName: "" })); }}
            error={errors.firstName}
            autoFocus
          />
          <Input
            label={s("form.lastName")}
            placeholder={s("placeholder.lastName")}
            value={lastName}
            onChange={(e) => { setLastName(e.target.value); setErrors((p) => ({ ...p, lastName: "" })); }}
            error={errors.lastName}
          />
        </div>

        <Input
          label={s("form.email")}
          type="email"
          value={info.email}
          readOnly
          hint={s("form.emailFixedByInvite")}
          className="bg-slate-50 text-slate-500 cursor-not-allowed"
        />

        <Input
          label={s("form.password")}
          showToggle
          placeholder="••••••••"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: "" })); }}
          error={errors.password}
          hint={s("form.passwordHint")}
          autoComplete="new-password"
        />

        <Input
          label={s("form.confirmPassword")}
          showToggle
          placeholder="••••••••"
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value); setErrors((p) => ({ ...p, confirm: "" })); }}
          error={errors.confirm}
          autoComplete="new-password"
        />

        <Button
          type="submit"
          variant="approve"
          size="lg"
          className="w-full"
          disabled={loading || info.existingAccountDetected}
        >
          {loading ? s("button.accepting") : s("button.acceptInvitation")}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        {t("haveAccount")}{" "}
        <Link href={ROUTES.login} className="font-medium text-blue-600 hover:underline">
          {s("button.login")}
        </Link>
      </p>
    </div>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense>
      <AcceptInvitationContent />
    </Suspense>
  );
}
