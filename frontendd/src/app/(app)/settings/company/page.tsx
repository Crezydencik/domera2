import { SettingsPageContent } from "../page";

type SettingsCompanyPageProps = {
  searchParams?: Promise<{ role?: string }>;
};

export default async function SettingsCompanyPage({ searchParams }: SettingsCompanyPageProps) {
  const params = (await searchParams) ?? {};
  return <SettingsPageContent roleHint={params.role} section="company" />;
}
