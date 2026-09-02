import { Sidebar } from "@/app/(app)/_components/sidebar";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { getAuthenticatedContext } from "@/shared/server/auth-context";
import type { ReactNode } from "react";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const context = await getAuthenticatedContext(undefined, { requireFreshProfile: true });

  return (
    <ConfirmProvider>
      <Sidebar initialProfile={context.profile ?? null} initialRole={context.role}>{children}</Sidebar>
    </ConfirmProvider>
  );
}
