import { redirect } from "next/navigation";

type MailingStylePageProps = {
  searchParams?: Promise<{ role?: string }>;
};

export default async function MailingStylePage({ searchParams }: MailingStylePageProps) {
  const params = (await searchParams) ?? {};
  const roleQuery = params.role ? `&role=${encodeURIComponent(params.role)}` : "";
  redirect(`/settings?section=emailBranding${roleQuery}`);
}
