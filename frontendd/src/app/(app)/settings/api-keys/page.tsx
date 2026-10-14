import { redirect } from "next/navigation";

type SettingsApiKeysPageProps = {
  searchParams?: Promise<{ role?: string }>;
};

export default async function SettingsApiKeysPage({ searchParams }: SettingsApiKeysPageProps) {
  const params = (await searchParams) ?? {};
  const roleQuery = params.role ? `&role=${encodeURIComponent(params.role)}` : "";
  redirect(`/settings?section=apiKey${roleQuery}`);
}
