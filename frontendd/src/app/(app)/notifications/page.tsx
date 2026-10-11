import { getNotificationsPageData } from "@/shared/server/page-loaders/notifications.loader";
import { NotificationsMailbox } from "./notifications-mailbox";

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ role?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const data = await getNotificationsPageData(params.role);
  const companyNamesById = new Map(data.managementCompanies.flatMap((company) => {
    const id = typeof company.id === "string" ? company.id : typeof company.companyId === "string" ? company.companyId : "";
    const name = typeof company.companyName === "string" ? company.companyName : typeof company.name === "string" ? company.name : "";
    return id && name ? [[id, name] as const] : [];
  }));
  const letters = data.notifications
    .filter((item) => item.channel.toLowerCase() === "information")
    .map((item) => ({ ...item, companyName: item.companyName || companyNamesById.get(item.companyId ?? "") }));

  return <NotificationsMailbox initialLetters={letters} />;
}
