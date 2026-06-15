import Link from "next/link";
import { FiShield, FiUsers } from "react-icons/fi";
import type { RoleDataBundle } from "@/shared/lib/domera-api.server";
import { ROUTES } from "@/shared/lib/routes";

export function PlatformAdminDashboard({ data }: { data: RoleDataBundle }) {
  const userCount = data.residents.length;

  return (
    <div className="space-y-5">
      <div className="border-b border-slate-200 pb-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-sky-700">
          <FiShield className="h-4 w-4" aria-hidden="true" />
          Platform administration
        </div>
        <h2 className="mt-2 text-2xl font-semibold text-slate-950">Control center</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-medium text-slate-500">Users</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{userCount}</p>
        </div>
      </div>

      <Link
        href={ROUTES.platformUsers}
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-700"
      >
        <FiUsers className="h-4 w-4" aria-hidden="true" />
        Manage users
      </Link>
    </div>
  );
}
