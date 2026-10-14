import { SettingsPageContent } from "@/app/(app)/settings/page";

type MailingStylePageProps = {
  searchParams?: Promise<{ role?: string }>;
};

export default async function MailingStylePage({ searchParams }: MailingStylePageProps) {
  const params = (await searchParams) ?? {};
  return <SettingsPageContent roleHint={params.role} section="emailBranding" />;
}
