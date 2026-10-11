import { redirect } from "next/navigation";
import { ROUTES } from "@/shared/lib/routes";

export default function SentMailingsPage() {
  redirect(`${ROUTES.mailings}#sent`);
}
