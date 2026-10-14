import { redirect } from "next/navigation";

type SettingsCompanyPageProps = {
  searchParams?: Promise<{ role?: string }>;
};

export default async function SettingsCompanyPage({ searchParams }: SettingsCompanyPageProps) {
  const params = (await searchParams) ?? {};
  const roleQuery = params.role ? `&role=${encodeURIComponent(params.role)}` : "";
  redirect(`/settings?section=company${roleQuery}`);
}
