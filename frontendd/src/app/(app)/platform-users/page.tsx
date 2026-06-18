"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FiInfo, FiRefreshCw, FiSearch, FiShield } from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { getPlatformUsers, type PlatformUser } from "@/shared/api/users";
import { useNotifications } from "@/shared/hooks/use-notifications";

type UserTab = "management" | "regular";

function userId(user: PlatformUser) {
  return user.uid || user.id || "";
}

function userName(user: PlatformUser) {
  const joined = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return user.fullName || joined || user.email || userId(user) || "Unknown user";
}

function userPhone(user: PlatformUser) {
  return user.companyPhone || user.phone || user.phoneNumber || user.mobile || user.telephone || "";
}

function isManagementUser(user: PlatformUser) {
  return user.role === "ManagementCompany" || user.role === "Accountant" || user.accountType === "ManagementCompany";
}

function matchesQuery(user: PlatformUser, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [userName(user), user.email, user.role, user.accountType, user.companyName, user.companyId]
    .filter((value): value is string => typeof value === "string")
    .some((value) => value.toLowerCase().includes(normalizedQuery));
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-slate-900">{value || "-"}</dd>
    </div>
  );
}

function UsersTable({
  users,
  emptyText,
  showCompany,
  onOpenInfo,
}: {
  users: PlatformUser[];
  emptyText: string;
  showCompany: boolean;
  onOpenInfo?: (user: PlatformUser) => void;
}) {
  const gridColumns = showCompany
    ? "grid-cols-[minmax(240px,1.2fr)_minmax(150px,.7fr)_minmax(220px,1fr)_64px]"
    : "grid-cols-[minmax(240px,1.2fr)_minmax(150px,.7fr)]";

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className={`grid ${gridColumns} gap-4 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500`}>
        <span>User</span>
        <span>Role</span>
        {showCompany ? <span>Company</span> : null}
        {showCompany ? <span className="text-right">Info</span> : null}
      </div>

      {users.length ? (
        <div className="divide-y divide-slate-100">
          {users.map((user) => {
            const id = userId(user);

            return (
              <div
                key={id || user.email}
                className={`grid ${gridColumns} gap-4 px-4 py-3 text-sm`}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-950">{userName(user)}</p>
                  <p className="truncate text-xs text-slate-500">{user.email || id}</p>
                </div>
                <div className="text-slate-700">{user.role || user.accountType || "-"}</div>
                {showCompany ? (
                  <div className="min-w-0">
                    <p className="truncate text-slate-700">{user.companyName || "-"}</p>
                  </div>
                ) : null}
                {showCompany ? (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => onOpenInfo?.(user)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-blue-200 text-blue-600 transition hover:bg-blue-50"
                      title="Company info"
                    >
                      <FiInfo className="h-4 w-4" aria-hidden="true" />
                      <span className="sr-only">Company info</span>
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-4 py-8 text-sm text-slate-500">{emptyText}</div>
      )}
    </section>
  );
}

export default function PlatformUsersPage() {
  const notifications = useNotifications();
  const notifyError = notifications.error;
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<UserTab>("management");
  const [loading, setLoading] = useState(true);
  const [selectedManagementUser, setSelectedManagementUser] = useState<PlatformUser | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getPlatformUsers();
      setUsers(response.items ?? []);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, [notifyError]);

  const filteredUsers = useMemo(
    () => users.filter((user) => matchesQuery(user, query)),
    [query, users],
  );
  const managementUsers = useMemo(
    () => filteredUsers.filter(isManagementUser),
    [filteredUsers],
  );
  const regularUsers = useMemo(
    () => filteredUsers.filter((user) => !isManagementUser(user)),
    [filteredUsers],
  );
  const activeUsers = activeTab === "management" ? managementUsers : regularUsers;

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-sky-700">
            <FiShield className="h-4 w-4" aria-hidden="true" />
            Platform administration
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">Users</h2>
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
          <label className="relative min-w-0 flex-1 lg:w-80">
            <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              placeholder="Search users"
            />
          </label>
          <Button type="button" variant="secondary" onClick={() => void loadUsers()} disabled={loading}>
            <FiRefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-sm text-slate-500">Loading users...</div>
      ) : (
        <div className="space-y-3">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setActiveTab("management")}
              className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                activeTab === "management"
                  ? "bg-sky-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              Management companies
              <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                activeTab === "management" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
              }`}>
                {managementUsers.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("regular")}
              className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                activeTab === "regular"
                  ? "bg-sky-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              Regular users
              <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                activeTab === "regular" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
              }`}>
                {regularUsers.length}
              </span>
            </button>
          </div>

          <UsersTable
            users={activeUsers}
            emptyText={activeTab === "management" ? "No management company users found." : "No regular users found."}
            showCompany={activeTab === "management"}
            onOpenInfo={setSelectedManagementUser}
          />
        </div>
      )}

      <Modal
        open={Boolean(selectedManagementUser)}
        onClose={() => setSelectedManagementUser(null)}
        title="Management company info"
        size="lg"
        footer={
          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={() => setSelectedManagementUser(null)}>
              Close
            </Button>
          </div>
        }
      >
        {selectedManagementUser ? (
          <div className="space-y-5">
            <div>
              <p className="text-sm text-slate-500">Company</p>
              <h3 className="mt-1 text-xl font-semibold text-slate-950">{selectedManagementUser.companyName || "-"}</h3>
            </div>

            <dl className="grid gap-4 sm:grid-cols-2">
              <InfoRow label="User" value={userName(selectedManagementUser)} />
              <InfoRow label="Email" value={selectedManagementUser.email} />
              <InfoRow label="Role" value={selectedManagementUser.role || selectedManagementUser.accountType} />
              <InfoRow label="Phone" value={userPhone(selectedManagementUser)} />
              <InfoRow label="Account type" value={selectedManagementUser.accountType} />
            </dl>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
