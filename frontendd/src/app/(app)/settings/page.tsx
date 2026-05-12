import { cookies } from "next/headers";
import { getRoleDataBundle } from "@/shared/lib/domera-api.server";
import { SettingsTabs } from "./settings-tabs";

type SettingsPageProps = {
  searchParams?: Promise<{ role?: string }>;
};

type UnknownRecord = Record<string, unknown>;

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function joinNameParts(profile: UnknownRecord | undefined): string {
  return firstString(
    profile?.fullName,
    [profile?.firstName, profile?.lastName].filter((value) => typeof value === "string" && value.trim()).join(" "),
    profile?.name,
    profile?.displayName,
  );
}

function maskPersonalCode(value: string): string {
  if (!value) return "190299-*****";
  const normalized = value.replace(/\s/g, "");
  if (normalized.length <= 6) return `${normalized}*****`;

  return `${normalized.slice(0, 6)}-*****`;
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const params = (await searchParams) ?? {};
  const data = await getRoleDataBundle(params.role);
  const cookieStore = await cookies();
  const profile = data.profile;

  const userId = firstString(profile?.uid, profile?.id, data.userId, cookieStore.get("userId")?.value);
  const email = firstString(profile?.email, cookieStore.get("userEmail")?.value, "kargini@inbox.lv");
  const fullName = firstString(joinNameParts(profile), email.split("@")[0], "DENISS KARGINS");
  const userName = fullName.toUpperCase();
  const clientNumber = firstString(profile?.clientNumber, profile?.customerNumber, userId, "13475715");
  const username = fullName;
  const phone = firstString(profile?.phone, profile?.phoneNumber, profile?.mobile, profile?.telephone, "");
  const personalCode = maskPersonalCode(firstString(profile?.personalCode, profile?.identityCode));

  return (
    <div className="mx-auto w-full max-w-5xl">
      <SettingsTabs
        user={{
          userName,
          userId,
          clientNumber,
          email,
          username,
          phone,
          personalCode,
        }}
      />
    </div>
  );
}
