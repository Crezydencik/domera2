import { Sidebar } from "@/app/(app)/_components/sidebar";
import type { ReactNode } from "react";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <Sidebar>{children}</Sidebar>;
}
