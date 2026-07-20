import { Sidebar } from "@/app/(app)/_components/sidebar";
import { ToastProvider } from "@/components/toast-provider";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import type { ReactNode } from "react";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <ConfirmProvider>
      <Sidebar>{children}</Sidebar>
      <ToastProvider />
    </ConfirmProvider>
  );
}
