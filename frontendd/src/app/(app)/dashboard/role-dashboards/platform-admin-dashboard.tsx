import Link from "next/link";
import { FiShield, FiUsers } from "react-icons/fi";
import type { RoleDataBundle } from "@/shared/lib/domera-api.server";
import { ROUTES } from "@/shared/lib/routes";

export function PlatformAdminDashboard({ data }: { data: RoleDataBundle }) {
  const userCount = data.residents.length;

  return (
    <div className="space-y-5">

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-medium text-slate-500">Users</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{userCount}</p>
        </div>
      </div>

    </div>
  );
}
