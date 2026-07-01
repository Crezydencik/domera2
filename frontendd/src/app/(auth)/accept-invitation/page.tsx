"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { FiAlertCircle, FiArrowRight, FiCheckCircle, FiLock, FiMail, FiUser, FiUserPlus } from "react-icons/fi";
import {
  AuthAlert,
  AuthCard,
  AuthFooterText,
  AuthHeader,
  AuthInfoBox,
  AuthResultState,
  ConfirmRow,
  PasswordStrengthPanel,
} from "@/components/auth/auth-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type PublicAccountType,
  establishUserSession,
  saveUserProfile,
  signInWithEmailPassword,
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
  accountType: PublicAccountType;
  inviteType?: string;
  existingAccountDetected?: boolean;
  firstName?: string;
  lastName?: string;
}

function normalizeEmail(value?: string | null): string {
  return String(value ?? "").trim().toLowerCase();
}

function readBrowserCookie(name: string): string {
  if (typeof document === "undefined") return "";

  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  if (!match?.[1]) return "";

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
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
  const [currentSessionEmail, setCurrentSessionEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setCurrentSessionEmail(normalizeEmail(readBrowserCookie("userEmail")));
  }, []);

  useEffect(() => {
    const token = params.get("token");

    if (!token) {
      setInfo(null);
      setResolving(false);
      return;
    }

    apiFetch<{
      invitation?: {
        id?: string;
        email?: string;
        apartmentId?: string | null;
        accountType?: string;
        inviteType?: string;
        firstName?: string;
        lastName?: string;
        apartmentLabel?: string;
        buildingLabel?: string;
        managerLabel?: string;
      };
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
          apartment: invitation.apartmentLabel || invitation.apartmentId || "Assigned apartment",
          building: invitation.buildingLabel || "Domera building",
          managerName: invitation.managerLabel || "Domera Manager",
          apartmentId: invitation.apartmentId ?? undefined,
          token,
          accountType:
            invitation.inviteType === "company-member"
              ? "ManagementCompany"
              : invitation.accountType === "Landlord"
                ? "Landlord"
                : "Resident",
          inviteType: invitation.inviteType,
          existingAccountDetected: data.existingAccountDetected,
          firstName: invitation.firstName,
          lastName: invitation.lastName,
        });
        setFirstName(invitation.firstName?.trim() ?? "");
        setLastName(invitation.lastName?.trim() ?? "");
      })
      .catch(() => setInfo(null))
      .finally(() => setResolving(false));
  }, [params]);

  const sessionEmailMismatch = Boolean(
    info && currentSessionEmail && normalizeEmail(info.email) !== currentSessionEmail,
  );

  const wrongAccountMessage =
    info && sessionEmailMismatch
      ? `This invitation is for ${info.email}. You are currently signed in as ${currentSessionEmail}. Sign out first or open the invitation in a private window.`
      : "";

  const loginHref = useMemo(() => {
    if (!info) return ROUTES.login;

    const next = `${ROUTES.acceptInvitation}?token=${encodeURIComponent(info.token)}&accept=1`;
    return `${ROUTES.login}?next=${encodeURIComponent(next)}`;
  }, [info]);

  const hasInvitedFullName = Boolean(info?.firstName?.trim() && info?.lastName?.trim());

  useEffect(() => {
    if (!info?.existingAccountDetected || params.get("accept") !== "1" || accepted) return;

    if (sessionEmailMismatch) {
      setErrors({ general: wrongAccountMessage });
      return;
    }

    let cancelled = false;
    const invitationToken = info.token;

    async function acceptAuthenticatedInvitation() {
      setLoading(true);
      setErrors({});

      try {
        await apiFetch("/invitations/accept", {
          method: "POST",
          body: JSON.stringify({
            token: invitationToken,
            gdprConsent: true,
          }),
        });

        if (cancelled) return;
        setAccepted(true);
        router.push(ROUTES.dashboard);
        router.refresh();
      } catch (error) {
        if (!cancelled) {
          setErrors({ general: error instanceof Error ? error.message : s("dbError") });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void acceptAuthenticatedInvitation();

    return () => {
      cancelled = true;
    };
  }, [accepted, info, params, router, s, sessionEmailMismatch, wrongAccountMessage]);

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault();
    if (sessionEmailMismatch) {
      setErrors({ general: wrongAccountMessage });
      return;
    }

    const next: Record<string, string> = {};
    if (!hasInvitedFullName && !firstName.trim()) next.firstName = "Required";
    if (!hasInvitedFullName && !lastName.trim()) next.lastName = "Required";
    if (!isStrongPassword(password)) next.password = s("form.passwordHint");
    if (password !== confirm) next.confirm = t("passwordsDoNotMatch");
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }

    setLoading(true);
    setErrors({});
    try {
      if (!info) {
        throw new Error("Invitation is invalid.");
      }

      await apiFetch("/invitations/accept", {
        method: "POST",
        body: JSON.stringify({
          token: info.token,
          password,
          gdprConsent: true,
        }),
      });

      const result = await signInWithEmailPassword(info.email, password);

      await establishUserSession({
        idToken: result.idToken,
        userId: result.userId,
        email: result.email,
        role: result.role,
        accountType: info.accountType,
        companyId: result.companyId,
        apartmentId: result.apartmentId,
      });

      if (info.inviteType !== "company-member") {
        await saveUserProfile(result.userId, {
          email: result.email,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          fullName: `${firstName} ${lastName}`.trim(),
          role: info.accountType,
          accountType: info.accountType,
          apartmentId: info.apartmentId,
        });
      }

      setAccepted(true);
      router.push(ROUTES.dashboard);
      router.refresh();
    } catch (error) {
      setErrors({ general: error instanceof Error ? error.message : s("dbError") });
    } finally {
      setLoading(false);
    }
  }

  if (resolving) {
    return (
      <AuthCard>
        <p className="text-sm text-slate-500">{s("loading")}</p>
      </AuthCard>
    );
  }

  if (!info) {
    return (
      <AuthResultState
        icon={FiAlertCircle}
        tone="red"
        title={t("invitationExpired")}
        actionHref={ROUTES.login}
        actionLabel={s("button.backToLogin")}
      />
    );
  }

  if (accepted) {
    return (
      <AuthResultState
        icon={FiCheckCircle}
        tone="green"
        title={t("invitationTitle")}
        description={t("invitationSubtitle")}
        actionHref={ROUTES.login}
        actionLabel={s("button.login")}
      />
    );
  }

  return (
    <div>
      <AuthHeader title={t("invitationTitle")} subtitle={t("invitationSubtitle")} icon={FiUserPlus} />

      <AuthInfoBox tone="blue" className="mb-6">
        <div className="divide-y divide-blue-100/80">
          {info.inviteType !== "company-member" && (
            <>
              <ConfirmRow label={t("invitationApartment")} value={info.apartment} />
              <ConfirmRow label={t("invitationBuilding")} value={info.building} />
            </>
          )}
          <ConfirmRow label={t("invitationFrom")} value={info.managerName} />
        </div>
      </AuthInfoBox>

      {info.existingAccountDetected && (
        <AuthAlert tone="amber" className="mb-5">
          {t("invitationExistingAccount")}
        </AuthAlert>
      )}

      {sessionEmailMismatch && (
        <AuthAlert className="mb-5">
          {wrongAccountMessage}
        </AuthAlert>
      )}

      {info.existingAccountDetected ? (
        <AuthCard>
          {errors.general && <AuthAlert className="mb-5">{errors.general}</AuthAlert>}
          <Link href={loginHref}>
            <Button
              variant="primary"
              size="lg"
              className="min-h-12 w-full rounded-xl"
              disabled={loading || sessionEmailMismatch}
            >
              {loading ? s("button.accepting") : t("invitationSignInToAccept")}
              {!loading && <FiArrowRight className="h-4 w-4" aria-hidden />}
            </Button>
          </Link>
        </AuthCard>
      ) : (
        <>
          <AuthCard>
            <form onSubmit={handleAccept} className="flex flex-col gap-5">
              {errors.general && <AuthAlert>{errors.general}</AuthAlert>}

              {!hasInvitedFullName && (
                <div className="grid gap-4 sm:grid-cols-2 sm:gap-3">
                  <Input
                    label={s("form.firstName")}
                    placeholder={s("placeholder.firstName")}
                    value={firstName}
                    onChange={(e) => {
                      setFirstName(e.target.value);
                      setErrors((previous) => ({ ...previous, firstName: "" }));
                    }}
                    error={errors.firstName}
                    autoFocus
                    leftIcon={<FiUser className="h-4 w-4" aria-hidden />}
                  />
                  <Input
                    label={s("form.lastName")}
                    placeholder={s("placeholder.lastName")}
                    value={lastName}
                    onChange={(e) => {
                      setLastName(e.target.value);
                      setErrors((previous) => ({ ...previous, lastName: "" }));
                    }}
                    error={errors.lastName}
                    leftIcon={<FiUser className="h-4 w-4" aria-hidden />}
                  />
                </div>
              )}

              <Input
                label={s("form.email")}
                type="email"
                value={info.email}
                readOnly
                hint={s("form.emailFixedByInvite")}
                className="cursor-not-allowed bg-slate-50 text-slate-500"
                leftIcon={<FiMail className="h-4 w-4" aria-hidden />}
              />

              <Input
                label={s("form.password")}
                showToggle
                placeholder="********"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrors((previous) => ({ ...previous, password: "" }));
                }}
                error={errors.password}
                hint={s("form.passwordHint")}
                autoComplete="new-password"
                leftIcon={<FiLock className="h-4 w-4" aria-hidden />}
              />

              <PasswordStrengthPanel password={password} translate={t} />

              <Input
                label={s("form.confirmPassword")}
                showToggle
                placeholder="********"
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  setErrors((previous) => ({ ...previous, confirm: "" }));
                }}
                error={errors.confirm}
                autoComplete="new-password"
                leftIcon={<FiLock className="h-4 w-4" aria-hidden />}
              />

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="min-h-12 w-full rounded-xl"
                disabled={loading || info.existingAccountDetected || sessionEmailMismatch}
              >
                {loading ? s("button.accepting") : s("button.acceptInvitation")}
                {!loading && <FiArrowRight className="h-4 w-4" aria-hidden />}
              </Button>
            </form>
          </AuthCard>

          <AuthFooterText>
            {t("haveAccount")}{" "}
            <Link href={loginHref} className="font-medium text-blue-600 hover:underline">
              {s("button.login")}
            </Link>
          </AuthFooterText>
        </>
      )}
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
