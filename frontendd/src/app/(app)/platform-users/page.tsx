"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FiRefreshCw, FiSearch, FiShield, FiToggleLeft, FiToggleRight } from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { getPlatformUsers, setBuildingCreationAccess, type PlatformUser } from "@/shared/api/users";
import { useNotifications } from "@/shared/hooks/use-notifications";

function userId(user: PlatformUser) {
  return user.uid || user.id || "";
}

function userName(user: PlatformUser) {
  const joined = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return user.fullName || joined || user.email || userId(user) || "Unknown user";
}

function isManagementUser(user: PlatformUser) {
  return user.role === "ManagementCompany" || user.role === "Accountant" || user.accountType === "ManagementCompany";
}

export default function PlatformUsersPage() {
  const notifications = useNotifications();
  const notifyError = notifications.error;
  const notifySuccess = notifications.success;
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return users;

    return users.filter((user) =>
      [userName(user), user.email, user.role, user.accountType, user.companyName, user.companyId]
        .filter((value): value is string => typeof value === "string")
        .some((value) => value.toLowerCase().includes(normalizedQuery)),
    );
  }, [query, users]);

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

  async function toggleBuildingAccess(user: PlatformUser) {
    const id = userId(user);
    if (!id) return;

    const nextValue = !user.canCreateBuildings;
    setSavingUserId(id);
    try {
      await setBuildingCreationAccess(id, nextValue, user.companyId);
      setUsers((current) =>
        current.map((item) => (userId(item) === id ? { ...item, canCreateBuildings: nextValue } : item)),
      );
      notifySuccess(nextValue ? "Building creation enabled." : "Building creation disabled.");
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Failed to update access.");
    } finally {
      setSavingUserId(null);
    }
  }

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

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="grid grid-cols-[minmax(220px,1.4fr)_minmax(130px,.7fr)_minmax(160px,1fr)_minmax(150px,.8fr)] gap-4 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <span>User</span>
          <span>Role</span>
          <span>Company</span>
          <span className="text-right">Create buildings</span>
        </div>

        {loading ? (
          <div className="px-4 py-8 text-sm text-slate-500">Loading users...</div>
        ) : filteredUsers.length ? (
          <div className="divide-y divide-slate-100">
            {filteredUsers.map((user) => {
              const id = userId(user);
              const canManageCreation = isManagementUser(user);
              const saving = savingUserId === id;

              return (
                <div
                  key={id || user.email}
                  className="grid grid-cols-[minmax(220px,1.4fr)_minmax(130px,.7fr)_minmax(160px,1fr)_minmax(150px,.8fr)] gap-4 px-4 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-950">{userName(user)}</p>
                    <p className="truncate text-xs text-slate-500">{user.email || id}</p>
                  </div>
                  <div className="text-slate-700">{user.role || user.accountType || "-"}</div>
                  <div className="min-w-0">
                    <p className="truncate text-slate-700">{user.companyName || user.companyId || "-"}</p>
                    {user.companyId ? <p className="truncate text-xs text-slate-400">{user.companyId}</p> : null}
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={!canManageCreation || saving}
                      onClick={() => void toggleBuildingAccess(user)}
                      className="inline-flex h-9 items-center gap-2 rounded-lg px-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-45"
                      title={canManageCreation ? "Toggle building creation access" : "Only management company users can receive this access"}
                    >
                      {user.canCreateBuildings ? (
                        <FiToggleRight className="h-6 w-6 text-emerald-600" aria-hidden="true" />
                      ) : (
                        <FiToggleLeft className="h-6 w-6 text-slate-400" aria-hidden="true" />
                      )}
                      <span>{user.canCreateBuildings ? "Allowed" : "Blocked"}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-8 text-sm text-slate-500">No users found.</div>
        )}
      </div>
    </div>
  );
}
