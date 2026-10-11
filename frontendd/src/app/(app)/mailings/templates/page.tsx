import { redirect } from "next/navigation";
import { ROUTES } from "@/shared/lib/routes";

export default function MailingTemplatesPage() {
  redirect(`${ROUTES.mailings}?mode=templates`);
}
