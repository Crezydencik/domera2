import { SettingsPageContent } from "../page";

type SettingsApiKeysPageProps = {
  searchParams?: Promise<{ role?: string }>;
};

export default async function SettingsApiKeysPage({ searchParams }: SettingsApiKeysPageProps) {
  const params = (await searchParams) ?? {};
  return <SettingsPageContent roleHint={params.role} section="apiKey" />;
}
