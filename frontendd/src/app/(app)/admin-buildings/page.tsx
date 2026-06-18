"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FiCheck, FiInfo, FiLock, FiRefreshCw, FiSearch, FiShield, FiUnlock, FiX } from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { getAdminBuildings, setBuildingEditLock, type AdminBuilding } from "@/shared/api/buildings";
import { getPlatformUsers, setBuildingCreationAccess, type PlatformUser } from "@/shared/api/users";
import { useNotifications } from "@/shared/hooks/use-notifications";
import { notifyBuildingCreationRequestsChanged } from "@/shared/lib/building-creation-requests-events";

const DEFAULT_PRICE_PER_APARTMENT = 0.5;

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type BuildingApprovalRequest = {
  key: string;
  requestId: string;
  userId: string;
  requesterName: string;
  requesterEmail?: string;
  companyId?: string;
  companyName?: string;
  buildingName?: string;
  buildingAddress?: string;
  comment?: string;
  apartmentsCount: number;
  subscriptionTermYears: number;
  subscriptionTermMonths: number;
  pricePerApartment: number;
  requestedAt?: unknown;
};

type AdminBuildingsTab = "approvals" | "buildings";

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function buildingName(building: AdminBuilding) {
  return firstText(building.name, building.title) || "Building";
}

function buildingAddress(building: AdminBuilding) {
  return firstText(building.address, building.street, building.location) || "-";
}

function buildingCompany(building: AdminBuilding) {
  return firstText(building.companyName) || "-";
}

function buildingManagedBy(building: AdminBuilding) {
  const managedBy = building.managedBy && typeof building.managedBy === "object" ? building.managedBy : {};

  return firstText(
    building.managerName,
    managedBy.managerName,
    managedBy.contactName,
    managedBy.name,
    building.companyName,
    managedBy.companyName,
  ) || "-";
}

function buildingContactEmail(building: AdminBuilding) {
  const managedBy = building.managedBy && typeof building.managedBy === "object" ? building.managedBy : {};

  return firstText(
    building.companyEmail,
    building.contactEmail,
    managedBy.companyEmail,
    managedBy.contactEmail,
    managedBy.email,
  ) || "-";
}

function buildingContactPhone(building: AdminBuilding) {
  const managedBy = building.managedBy && typeof building.managedBy === "object" ? building.managedBy : {};

  return firstText(
    building.companyPhone,
    building.contactPhone,
    managedBy.companyPhone,
    managedBy.contactPhone,
    managedBy.phone,
  ) || "-";
}

function buildingApartments(building: AdminBuilding) {
  const total = Number(building.apartmentsCount ?? building.apartments ?? 0);
  const occupied = Number(building.occupiedApartments ?? 0);
  return `${Number.isFinite(occupied) ? occupied : 0} / ${Number.isFinite(total) ? total : 0}`;
}

function positiveNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return 0;
}

function requestBuildingData(request: NonNullable<PlatformUser["buildingCreationRequests"]>[number]) {
  return request.building && typeof request.building === "object" ? request.building : {};
}

function requestApartmentsCount(request: NonNullable<PlatformUser["buildingCreationRequests"]>[number]) {
  const building = requestBuildingData(request);
  return Math.floor(positiveNumber(request.apartmentsCount, request.apartments, building.apartmentsCount, building.apartments));
}

function requestSubscriptionTermYears(request: NonNullable<PlatformUser["buildingCreationRequests"]>[number]) {
  const building = requestBuildingData(request);
  const years = Math.floor(positiveNumber(
    request.subscriptionTermYears,
    request.subscriptionDurationYears,
    building.subscriptionTermYears,
    building.subscriptionDurationYears,
    Math.floor(positiveNumber(
      request.subscriptionTermMonths,
      request.subscriptionDurationMonths,
      building.subscriptionTermMonths,
      building.subscriptionDurationMonths,
      12,
    ) / 12),
    1,
  ));
  return Math.max(1, years);
}

function requestSubscriptionTermMonths(request: NonNullable<PlatformUser["buildingCreationRequests"]>[number]) {
  const building = requestBuildingData(request);
  const months = Math.floor(positiveNumber(
    request.subscriptionTermMonths,
    request.subscriptionDurationMonths,
    building.subscriptionTermMonths,
    building.subscriptionDurationMonths,
    requestSubscriptionTermYears(request) * 12,
    1,
  ));
  return Math.max(1, months);
}

function requestPricePerApartment(request: NonNullable<PlatformUser["buildingCreationRequests"]>[number]) {
  const building = requestBuildingData(request);
  return positiveNumber(
    request.subscriptionPricePerApartment,
    request.pricePerApartment,
    request.monthlyPricePerApartment,
    building.subscriptionPricePerApartment,
    building.pricePerApartment,
    building.monthlyPricePerApartment,
    DEFAULT_PRICE_PER_APARTMENT,
  );
}

function requestComment(request: NonNullable<PlatformUser["buildingCreationRequests"]>[number]) {
  const building = requestBuildingData(request);
  return firstText(request.comment, request.buildingComment, building.comment, building.buildingComment);
}

function parsePriceInput(value: string) {
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : NaN;
}

function formatPriceInput(value: number) {
  return value.toFixed(2);
}

function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

function userId(user: PlatformUser) {
  return user.uid || user.id || "";
}

function userName(user: PlatformUser) {
  const joined = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return user.fullName || joined || user.email || userId(user) || "Unknown user";
}

function collectApprovalRequests(users: PlatformUser[]): BuildingApprovalRequest[] {
  return users.flatMap((user) => {
    const requesterId = userId(user);
    if (!requesterId) return [];

    const requests = user.buildingCreationRequests?.length
      ? user.buildingCreationRequests
      : user.buildingCreationRequestStatus === "pending"
        ? [{
            requestId: user.buildingCreationRequestId,
            buildingName: user.buildingCreationRequestBuildingName,
            buildingAddress: user.buildingCreationRequestBuildingAddress,
            companyId: user.companyId,
            companyName: user.companyName,
            requestedAt: user.buildingCreationAccessRequestedAt,
          }]
        : [];

    return requests
      .filter((request) => request.requestId || request.id)
      .map((request) => {
        const requestId = request.requestId || request.id || "";

        return {
          key: `${requesterId}:${requestId}`,
          requestId,
          userId: requesterId,
          requesterName: userName(user),
          requesterEmail: user.email,
          companyId: request.companyId || user.companyId,
          companyName: request.companyName || user.companyName,
          buildingName: request.buildingName,
          buildingAddress: request.buildingAddress,
          comment: requestComment(request),
          apartmentsCount: requestApartmentsCount(request),
          subscriptionTermYears: requestSubscriptionTermYears(request),
          subscriptionTermMonths: requestSubscriptionTermMonths(request),
          pricePerApartment: requestPricePerApartment(request),
          requestedAt: request.requestedAt,
        };
      });
  });
}

function matchesApprovalQuery(request: BuildingApprovalRequest, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [
    request.requesterName,
    request.requesterEmail,
    request.companyName,
    request.companyId,
    request.buildingName,
    request.buildingAddress,
    request.comment,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .some((value) => value.toLowerCase().includes(normalizedQuery));
}

function formatDate(value?: unknown) {
  if (!value) return "-";

  const formatStableDateTime = (date: Date) => {
    if (Number.isNaN(date.getTime())) return "-";

    const pad = (part: number) => String(part).padStart(2, "0");
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
  };

  if (value instanceof Date) {
    return formatStableDateTime(value);
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : formatStableDateTime(date);
  }

  if (typeof value === "object") {
    const timestamp = value as { toDate?: () => Date; seconds?: number; _seconds?: number };

    if (typeof timestamp.toDate === "function") {
      const date = timestamp.toDate();
      return formatStableDateTime(date);
    }

    const seconds = typeof timestamp.seconds === "number" ? timestamp.seconds : timestamp._seconds;
    if (typeof seconds === "number") {
      const date = new Date(seconds * 1000);
      return formatStableDateTime(date);
    }
  }

  return "-";
}

function statusClass(building: AdminBuilding) {
  const status = firstText(building.status).toLowerCase();
  if (status === "rejected" || status === "cancelled" || status === "canceled") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  if (building.editLocked) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  if (status === "needs review" || status === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function isRejectedBuilding(building: AdminBuilding) {
  const status = firstText(building.status).toLowerCase();
  return status === "rejected" || status === "cancelled" || status === "canceled";
}

function statusLabel(building: AdminBuilding) {
  const status = firstText(building.status);
  if (status.toLowerCase() === "rejected" || status.toLowerCase() === "cancelled" || status.toLowerCase() === "canceled") {
    return status;
  }

  return building.editLocked ? "Locked" : status || "Active";
}

function buildingReviewComment(building: AdminBuilding) {
  return firstText(
    building.rejectionComment,
    building.reviewComment,
    building.rejectedReason,
    building.buildingCreationAccessReviewComment,
  );
}

function matchesBuildingQuery(building: AdminBuilding, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [
    buildingName(building),
    buildingAddress(building),
    buildingCompany(building),
    firstText(building.status),
  ].some((value) => value.toLowerCase().includes(normalizedQuery));
}

function ApprovalInfoRow({ label, value }: { label: string; value?: string | number }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-slate-900">{value || "-"}</dd>
    </div>
  );
}

export default function AdminBuildingsPage() {
  const notifications = useNotifications();
  const notifyError = notifications.error;
  const notifySuccess = notifications.success;
  const [buildings, setBuildings] = useState<AdminBuilding[]>([]);
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [activeTab, setActiveTab] = useState<AdminBuildingsTab>("approvals");
  const [query, setQuery] = useState("");
  const [approvalsQuery, setApprovalsQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [approvalsLoading, setApprovalsLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingApprovalKey, setSavingApprovalKey] = useState<string | null>(null);
  const [selectedApprovalRequest, setSelectedApprovalRequest] = useState<BuildingApprovalRequest | null>(null);
  const [rejectingApprovalRequest, setRejectingApprovalRequest] = useState<BuildingApprovalRequest | null>(null);
  const [selectedBuildingInfo, setSelectedBuildingInfo] = useState<AdminBuilding | null>(null);
  const [rejectionComment, setRejectionComment] = useState("");
  const [approvalPriceInput, setApprovalPriceInput] = useState("");
  const [approvalIsFree, setApprovalIsFree] = useState(false);

  const loadBuildings = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getAdminBuildings();
      setBuildings(response.items ?? []);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Failed to load buildings.");
    } finally {
      setLoading(false);
    }
  }, [notifyError]);

  const loadApprovals = useCallback(async () => {
    setApprovalsLoading(true);
    try {
      const response = await getPlatformUsers();
      setUsers(response.items ?? []);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Failed to load approvals.");
    } finally {
      setApprovalsLoading(false);
    }
  }, [notifyError]);

  const filteredBuildings = useMemo(
    () => buildings.filter((building) => matchesBuildingQuery(building, query)),
    [buildings, query],
  );
  const approvalRequests = useMemo(
    () => collectApprovalRequests(users).filter((request) => matchesApprovalQuery(request, approvalsQuery)),
    [approvalsQuery, users],
  );
  const activeSearchValue = activeTab === "approvals" ? approvalsQuery : query;
  const activeSearchPlaceholder = activeTab === "approvals" ? "Search approvals" : "Search buildings";
  const approvalModalRate = approvalIsFree ? 0 : parsePriceInput(approvalPriceInput);
  const approvalModalMonthly =
    selectedApprovalRequest && Number.isFinite(approvalModalRate)
      ? selectedApprovalRequest.apartmentsCount * approvalModalRate
      : 0;
  const approvalModalTotal = selectedApprovalRequest
    ? approvalModalMonthly * selectedApprovalRequest.subscriptionTermMonths
    : 0;

  const refreshAll = useCallback(async () => {
    await Promise.all([loadApprovals(), loadBuildings()]);
  }, [loadApprovals, loadBuildings]);

  function openApprovalModal(request: BuildingApprovalRequest) {
    const initialRate = request.pricePerApartment;
    setSelectedApprovalRequest(request);
    setApprovalIsFree(initialRate === 0);
    setApprovalPriceInput(formatPriceInput(initialRate));
  }

  function closeApprovalModal() {
    setSelectedApprovalRequest(null);
    setApprovalPriceInput("");
    setApprovalIsFree(false);
  }

  function openRejectModal(request: BuildingApprovalRequest) {
    setRejectingApprovalRequest(request);
    setRejectionComment("");
  }

  function closeRejectModal() {
    setRejectingApprovalRequest(null);
    setRejectionComment("");
  }

  async function reviewRequest(
    request: BuildingApprovalRequest,
    approved: boolean,
    subscriptionPricePerApartment?: number,
    reviewComment?: string,
  ) {
    const rate = subscriptionPricePerApartment ?? 0;
    if (approved && !Number.isFinite(rate)) {
      notifyError("Enter a valid non-negative subscription rate.");
      return;
    }

    const normalizedComment = reviewComment?.trim() ?? "";
    if (!approved && !normalizedComment) {
      notifyError("Enter a rejection comment.");
      return;
    }

    setSavingApprovalKey(request.key);
    try {
      const response = await setBuildingCreationAccess(
        request.userId,
        approved,
        request.companyId,
        request.requestId,
        approved ? { subscriptionPricePerApartment: rate } : { reviewComment: normalizedComment },
      );
      await refreshAll();
      notifyBuildingCreationRequestsChanged();
      notifySuccess(
        approved
          ? response.billingInvoiceId
            ? "Building request approved and a payment invoice was created."
            : "Building request approved and the building was created."
          : "Building request rejected.",
      );
      if (approved) closeApprovalModal();
      if (!approved) closeRejectModal();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Failed to review request.");
    } finally {
      setSavingApprovalKey(null);
    }
  }

  async function approveSelectedRequest() {
    if (!selectedApprovalRequest) return;

    const rate = approvalIsFree ? 0 : parsePriceInput(approvalPriceInput);
    if (!Number.isFinite(rate) || (!approvalIsFree && rate <= 0)) {
      notifyError("Enter a positive subscription rate or mark the request as free.");
      return;
    }

    await reviewRequest(selectedApprovalRequest, true, rate);
  }

  async function rejectSelectedRequest() {
    if (!rejectingApprovalRequest) return;
    await reviewRequest(rejectingApprovalRequest, false, undefined, rejectionComment);
  }

  async function toggleLock(building: AdminBuilding) {
    setSavingId(building.id);
    try {
      const nextLocked = !building.editLocked;
      await setBuildingEditLock(building.id, nextLocked);
      setBuildings((current) =>
        current.map((item) => (item.id === building.id ? { ...item, editLocked: nextLocked } : item)),
      );
      notifySuccess(nextLocked ? "Building editing locked." : "Building editing unlocked.");
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Failed to update building lock.");
    } finally {
      setSavingId(null);
    }
  }

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-sky-700">
            <FiShield className="h-4 w-4" aria-hidden="true" />
            Platform administration
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">Buildings</h2>
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
          <label className="relative min-w-0 flex-1 lg:w-80">
            <FiSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              value={activeSearchValue}
              onChange={(event) => {
                if (activeTab === "approvals") {
                  setApprovalsQuery(event.target.value);
                  return;
                }

                setQuery(event.target.value);
              }}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              placeholder={activeSearchPlaceholder}
            />
          </label>
          <Button type="button" variant="secondary" onClick={() => void refreshAll()} disabled={loading || approvalsLoading}>
            <FiRefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setActiveTab("approvals")}
          className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
            activeTab === "approvals"
              ? "bg-sky-600 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          Approvals
          <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
            activeTab === "approvals" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
          }`}>
            {approvalRequests.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("buildings")}
          className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
            activeTab === "buildings"
              ? "bg-sky-600 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          Buildings
          <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
            activeTab === "buildings" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
          }`}>
            {filteredBuildings.length}
          </span>
        </button>
      </div>

      {activeTab === "approvals" ? (
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-4">
          <h3 className="text-base font-semibold text-slate-950">Approvals</h3>
          <p className="mt-1 text-sm text-slate-500">Building creation requests from management companies.</p>
        </div>

        <div className="grid grid-cols-[minmax(150px,1fr)_minmax(150px,1fr)_minmax(180px,1.1fr)_minmax(90px,.45fr)_minmax(80px,.4fr)_minmax(120px,.55fr)_minmax(150px,.7fr)] gap-4 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <span>Requester</span>
          <span>Company</span>
          <span>Building</span>
          <span>Apartments</span>
          <span>Term</span>
          <span>Requested</span>
          <span className="text-right">Actions</span>
        </div>

        {approvalsLoading ? (
          <div className="px-4 py-8 text-sm text-slate-500">Loading approvals...</div>
        ) : approvalRequests.length ? (
          <div className="divide-y divide-slate-100">
            {approvalRequests.map((request) => {
              const saving = savingApprovalKey === request.key;

              return (
                <div
                  key={request.key}
                  className="grid grid-cols-[minmax(150px,1fr)_minmax(150px,1fr)_minmax(180px,1.1fr)_minmax(90px,.45fr)_minmax(80px,.4fr)_minmax(120px,.55fr)_minmax(150px,.7fr)] gap-4 px-4 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-950">{request.requesterName}</p>
                    <p className="truncate text-xs text-slate-500">{request.requesterEmail || request.userId}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-slate-700">{request.companyName || request.companyId || "-"}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{request.buildingName || "New building"}</p>
                    {request.buildingAddress ? <p className="truncate text-xs text-slate-500">{request.buildingAddress}</p> : null}
                  </div>
                  <div className="text-slate-700">{request.apartmentsCount}</div>
                  <div className="text-slate-700">{request.subscriptionTermYears} yr</div>
                  <div className="text-slate-600">{formatDate(request.requestedAt)}</div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => openRejectModal(request)}
                      className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:pointer-events-none disabled:opacity-45"
                      title="Reject building request"
                    >
                      <FiX className="h-4 w-4" aria-hidden="true" />
                      <span>Reject</span>
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => openApprovalModal(request)}
                      className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:pointer-events-none disabled:opacity-45"
                      title="Review and approve this building"
                    >
                      <FiCheck className="h-4 w-4" aria-hidden="true" />
                      <span>{saving ? "Saving" : "Approve"}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-8 text-sm text-slate-500">No pending approvals.</div>
        )}
      </section>
      ) : null}

      {activeTab === "buildings" ? (
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="grid grid-cols-[minmax(200px,1fr)_minmax(210px,1fr)_minmax(170px,.8fr)_minmax(100px,.5fr)_minmax(120px,.5fr)_minmax(210px,.75fr)] gap-4 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <span>Building</span>
          <span>Address</span>
          <span>Company</span>
          <span>Apartments</span>
          <span>Status</span>
          <span className="text-right">Actions</span>
        </div>

        {loading ? (
          <div className="px-4 py-8 text-sm text-slate-500">Loading buildings...</div>
        ) : filteredBuildings.length ? (
          <div className="divide-y divide-slate-100">
            {filteredBuildings.map((building) => {
              const saving = savingId === building.id;
              const rejected = isRejectedBuilding(building);
              const reviewComment = buildingReviewComment(building);

              return (
                <div
                  key={building.id}
                  className="grid grid-cols-[minmax(200px,1fr)_minmax(210px,1fr)_minmax(170px,.8fr)_minmax(100px,.5fr)_minmax(120px,.5fr)_minmax(210px,.75fr)] gap-4 px-4 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-950">{buildingName(building)}</p>
                  </div>
                  <p className="min-w-0 truncate text-slate-700">{buildingAddress(building)}</p>
                  <p className="min-w-0 truncate text-slate-700">{buildingCompany(building)}</p>
                  <p className="text-slate-700">{buildingApartments(building)}</p>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(building)}`}>
                        {statusLabel(building)}
                      </span>
                      {reviewComment ? (
                        <span
                          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-500"
                          title={reviewComment}
                          aria-label="Review comment"
                        >
                          i
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedBuildingInfo(building)}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-sky-200 px-3 text-sm font-medium text-sky-700 transition hover:bg-sky-50"
                      title="Building info"
                    >
                      <FiInfo className="h-4 w-4" aria-hidden="true" />
                      <span>Info</span>
                    </button>
                    {rejected ? null : (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void toggleLock(building)}
                        className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition disabled:pointer-events-none disabled:opacity-45 ${
                          building.editLocked
                            ? "border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                            : "border border-rose-200 text-rose-700 hover:bg-rose-50"
                        }`}
                        title={building.editLocked ? "Unlock editing" : "Lock editing"}
                      >
                        {building.editLocked ? <FiUnlock className="h-4 w-4" aria-hidden="true" /> : <FiLock className="h-4 w-4" aria-hidden="true" />}
                        <span>{saving ? "Saving" : building.editLocked ? "Unlock" : "Lock"}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-8 text-sm text-slate-500">No buildings found.</div>
        )}
      </div>
      ) : null}

      <Modal
        open={Boolean(selectedApprovalRequest)}
        onClose={closeApprovalModal}
        title="Approve building request"
        size="lg"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={closeApprovalModal} disabled={Boolean(savingApprovalKey)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="approve"
              onClick={() => void approveSelectedRequest()}
              disabled={Boolean(savingApprovalKey) || (!approvalIsFree && (!Number.isFinite(approvalModalRate) || approvalModalRate <= 0))}
            >
              {savingApprovalKey ? "Approving..." : "Approve"}
            </Button>
          </div>
        }
      >
        {selectedApprovalRequest ? (
          <div className="space-y-5">
            <dl className="grid gap-4 sm:grid-cols-2">
              <ApprovalInfoRow label="Requester" value={selectedApprovalRequest.requesterName} />
              <ApprovalInfoRow label="Email" value={selectedApprovalRequest.requesterEmail} />
              <ApprovalInfoRow label="Company" value={selectedApprovalRequest.companyName || selectedApprovalRequest.companyId} />
              <ApprovalInfoRow label="Building" value={selectedApprovalRequest.buildingName || "New building"} />
              <ApprovalInfoRow label="Address" value={selectedApprovalRequest.buildingAddress} />
              <ApprovalInfoRow label="Comment" value={selectedApprovalRequest.comment} />
              <ApprovalInfoRow label="Apartments" value={selectedApprovalRequest.apartmentsCount} />
              <ApprovalInfoRow label="Term" value={`${selectedApprovalRequest.subscriptionTermYears} yr`} />
              <ApprovalInfoRow label="Requested" value={formatDate(selectedApprovalRequest.requestedAt)} />
              <ApprovalInfoRow label="Monthly" value={formatCurrency(approvalModalMonthly)} />
              <ApprovalInfoRow label="Total" value={formatCurrency(approvalModalTotal)} />
            </dl>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <label className="flex items-center gap-3 text-sm font-medium text-slate-900">
                <input
                  type="checkbox"
                  checked={approvalIsFree}
                  onChange={(event) => setApprovalIsFree(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                Free building subscription
              </label>

              <label className="mt-4 block">
                <span className="text-sm font-semibold text-slate-700">Price per apartment</span>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-sm text-slate-500">EUR</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={approvalIsFree ? "0.00" : approvalPriceInput}
                    disabled={approvalIsFree || Boolean(savingApprovalKey)}
                    onChange={(event) => setApprovalPriceInput(event.target.value)}
                    className="h-10 w-32 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </div>
              </label>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(rejectingApprovalRequest)}
        onClose={closeRejectModal}
        title="Reject building request"
        size="md"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={closeRejectModal} disabled={Boolean(savingApprovalKey)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => void rejectSelectedRequest()}
              disabled={Boolean(savingApprovalKey) || !rejectionComment.trim()}
            >
              {savingApprovalKey ? "Rejecting..." : "Reject"}
            </Button>
          </div>
        }
      >
        {rejectingApprovalRequest ? (
          <div className="space-y-4">
            <dl className="grid gap-4 sm:grid-cols-2">
              <ApprovalInfoRow label="Company" value={rejectingApprovalRequest.companyName || rejectingApprovalRequest.companyId} />
              <ApprovalInfoRow label="Building" value={rejectingApprovalRequest.buildingName || "New building"} />
              <ApprovalInfoRow label="Address" value={rejectingApprovalRequest.buildingAddress} />
              <ApprovalInfoRow label="Requester" value={rejectingApprovalRequest.requesterName} />
            </dl>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Comment for management company</span>
              <textarea
                value={rejectionComment}
                onChange={(event) => setRejectionComment(event.target.value)}
                rows={4}
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                placeholder="Explain why the request was rejected"
              />
            </label>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(selectedBuildingInfo)}
        onClose={() => setSelectedBuildingInfo(null)}
        title="Building info"
        size="lg"
        footer={
          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={() => setSelectedBuildingInfo(null)}>
              Close
            </Button>
          </div>
        }
      >
        {selectedBuildingInfo ? (
          <div className="space-y-5">
            <dl className="grid gap-4 sm:grid-cols-2">
              <ApprovalInfoRow label="Building" value={buildingName(selectedBuildingInfo)} />
              <ApprovalInfoRow label="Address" value={buildingAddress(selectedBuildingInfo)} />
              <ApprovalInfoRow label="Status" value={statusLabel(selectedBuildingInfo)} />
              <ApprovalInfoRow label="Apartments" value={buildingApartments(selectedBuildingInfo)} />
              <ApprovalInfoRow label="Managed by" value={buildingManagedBy(selectedBuildingInfo)} />
              <ApprovalInfoRow label="Company" value={buildingCompany(selectedBuildingInfo)} />
              <ApprovalInfoRow label="Email" value={buildingContactEmail(selectedBuildingInfo)} />
              <ApprovalInfoRow label="Phone" value={buildingContactPhone(selectedBuildingInfo)} />
              <ApprovalInfoRow label="Review comment" value={buildingReviewComment(selectedBuildingInfo)} />
              <ApprovalInfoRow label="Company ID" value={selectedBuildingInfo.companyId} />
              <ApprovalInfoRow label="Building ID" value={selectedBuildingInfo.id} />
            </dl>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

