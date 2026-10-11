import { Sidebar } from "@/app/(app)/_components/sidebar";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { getAuthenticatedContext } from "@/shared/server/auth-context";
import type { ReactNode } from "react";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // The proxy provides signed session claims as request headers. Do not block every
  // protected navigation on /users/me; pages that need editable profile fields ask
  // for a fresh profile explicitly.
  const context = await getAuthenticatedContext();

  return (
    <ConfirmProvider>
      <Sidebar initialProfile={context.profile ?? null} initialRole={context.role}>{children}</Sidebar>
    </ConfirmProvider>
  );
}
