"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { FaBuilding } from "react-icons/fa";
import { DataTable } from "@/components/data-table";
import { SectionCard } from "@/components/section-card";
import { ApartmentsManagementActionsMenu, type ManagementActionApartment, type ManagementActionBuildingOption } from "./_management-actions-menu";
import { ApartmentsManagementRowActions, type ApartmentResidentOption } from "./_management-row-actions";
import { RegistryBuildingFilter, type RegistryBuildingOption } from "./_registry-building-filter";
import type { RoleDataBundle } from "@/shared/lib/domera-api.server";
import { ROUTES } from "@/shared/lib/routes";

function hasReadableText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function looksLikeOpaqueId(value: string) {
  return /^[A-Za-z0-9_-]{12,}$/.test(value.trim());
}

function toDisplayString(value: unknown, fallback = "—") {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return fallback;
}

function compareApartmentOrder(a: Record<string, unknown>, b: Record<string, unknown>) {
  const left = toDisplayString(a.number ?? a.apartmentNumber ?? a.id ?? a.apartmentId, "");
  const right = toDisplayString(b.number ?? b.apartmentNumber ?? b.id ?? b.apartmentId, "");

  const leftNumber = Number(left);
  const rightNumber = Number(right);
  const bothNumeric = Number.isFinite(leftNumber) && Number.isFinite(rightNumber);

  if (bothNumeric && leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }

  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

type ApartmentOccupancyStatus = "occupied" | "pending" | "vacant";

function isApprovedBuilding(building: { status?: string }) {
  const status = String(building.status ?? "").trim().toLowerCase();
  return status !== "pending" && status !== "rejected" && status !== "cancelled" && status !== "canceled";
}

function getApartmentOccupancyStatus(apartment: Record<string, unknown>): ApartmentOccupancyStatus {
  const tenants = Array.isArray(apartment.tenants) ? apartment.tenants.length : 0;
  const ownerActivated = apartment.ownerActivated === true || apartment.ownerActivated === "true";
  const ownerPending = !ownerActivated && hasReadableText(apartment.ownerEmail) && (
    hasReadableText(apartment.ownerInvitationId) ||
    Boolean(apartment.ownerInvitedAt)
  );

  if (apartment.residentId || tenants > 0 || ownerActivated) {
    return "occupied";
  }

  return ownerPending ? "pending" : "vacant";
}

function getStatusTranslationKey(status: ApartmentOccupancyStatus) {
  if (status === "occupied") return "management.occupied";
  if (status === "pending") return "management.pending";
  return "management.vacant";
}

function getStatusClassName(status: ApartmentOccupancyStatus) {
  if (status === "occupied") return "bg-emerald-100 text-emerald-700";
  if (status === "pending") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

export function ApartmentsManagementView({
  data,
}: {
  data: RoleDataBundle;
}) {
  const t = useTranslations("apartments");
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | undefined>(undefined);
  const approvedBuildings = useMemo(() => data.buildings.filter(isApprovedBuilding), [data.buildings]);
  const hasBuildings = approvedBuildings.length > 0;
  const lockedBuildingIds = useMemo(
    () => new Set(approvedBuildings.filter((building) => building.editLocked === true).map((building) => building.id)),
    [approvedBuildings],
  );

  const residentById = useMemo(
    () => new Map(data.residents.map((resident) => [resident.id, resident])),
    [data.residents],
  );
  const buildingOptions: RegistryBuildingOption[] = useMemo(
    () => [...approvedBuildings]
      .map((building) => ({
        id: building.id,
        label: building.address !== "—" ? building.address : building.name,
      }))
      .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base", numeric: true })),
    [approvedBuildings],
  );
  const menuBuildingOptions: ManagementActionBuildingOption[] = useMemo(
    () => [...approvedBuildings]
      .map((building) => ({
        id: building.id,
        label: building.address !== "—" ? building.address : building.name,
        readingConfig: building.readingConfig,
      }))
      .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base", numeric: true })),
    [approvedBuildings],
  );
  const normalizedBuildingId = typeof selectedBuildingId === "string" && selectedBuildingId.trim()
    ? selectedBuildingId.trim()
    : undefined;
  const selectedBuildingLabel = useMemo(
    () => buildingOptions.find((building) => building.id === normalizedBuildingId)?.label,
    [buildingOptions, normalizedBuildingId],
  );
  const selectedBuildingLocked = Boolean(normalizedBuildingId && lockedBuildingIds.has(normalizedBuildingId));
  const residentOptions: ApartmentResidentOption[] = useMemo(
    () => Array.from(
      new Map(
        data.residents
          .filter((resident) => !/landlord|management|accountant|admin/i.test(resident.role))
          .map((resident) => {
            const label = hasReadableText(resident.fullName) && !looksLikeOpaqueId(resident.fullName)
              ? resident.fullName.trim()
              : !looksLikeOpaqueId(resident.id)
                ? resident.id
                : t("common.notSpecified");
            return [resident.id, { id: resident.id, label }] as const;
          }),
      ).values(),
    ),
    [data.residents, t],
  );

  const filteredApartments = useMemo(
    () => normalizedBuildingId
      ? data.apartments.filter((item) => {
          const buildingIdValue = item.buildingId;
          const buildingId = hasReadableText(buildingIdValue) ? buildingIdValue.trim() : "";
          return buildingId === normalizedBuildingId;
        })
      : data.apartments,
    [data.apartments, normalizedBuildingId],
  );

  const managementMenuApartments: ManagementActionApartment[] = useMemo(() => filteredApartments.map((item) => {
    const residentIdValue = item.residentId;
    const residentId = hasReadableText(residentIdValue) ? residentIdValue.trim() : undefined;
    const resolvedOwnerFromResident = residentId ? residentById.get(residentId) : undefined;
    const occupancyStatus = getApartmentOccupancyStatus(item);
    const rawOwner = hasReadableText(item.owner)
      ? String(item.owner)
      : hasReadableText(item.ownerEmail)
        ? String(item.ownerEmail)
        : resolvedOwnerFromResident?.fullName || "";

    return {
      id: String(item.id ?? item.apartmentId ?? item.number ?? "—"),
      number: String(item.number ?? item.id ?? "—"),
      buildingId: hasReadableText(item.buildingId) ? String(item.buildingId).trim() : "",
      owner: rawOwner && !looksLikeOpaqueId(rawOwner) ? rawOwner : t("common.notSpecified"),
      area: String(item.area ?? item.squareMeters ?? item.heatingArea ?? item.managementArea ?? "—"),
      declaredResidents: String(item.declaredResidents ?? item.declaredCount ?? item.registeredResidents ?? item.registeredCount ?? "—"),
      floor: String(item.floor ?? item.level ?? "—"),
      status: t(getStatusTranslationKey(occupancyStatus)),
      residentId,
      isOccupied: occupancyStatus === "occupied",
      isVacant: occupancyStatus === "vacant",
      isLocked: hasReadableText(item.buildingId) && lockedBuildingIds.has(String(item.buildingId).trim()),
    };
  }), [filteredApartments, lockedBuildingIds, residentById, t]);

  const rows = useMemo(() => [...filteredApartments].sort((a, b) => compareApartmentOrder(a, b)).map((item) => {
    const id = String(item.id ?? item.apartmentId ?? item.number ?? "—");
    const occupancyStatus = getApartmentOccupancyStatus(item);
    const status = t(getStatusTranslationKey(occupancyStatus));
    const area = String(item.area ?? item.squareMeters ?? item.heatingArea ?? item.managementArea ?? "—");
    const declaredResidents = String(
      item.declaredResidents ?? item.declaredCount ?? item.registeredResidents ?? item.registeredCount ?? "—",
    );
    const floor = String(item.floor ?? item.level ?? "—");
    const residentIdValue = item.residentId;
    const residentId = hasReadableText(residentIdValue) ? residentIdValue.trim() : undefined;
    const resolvedOwnerFromResident = residentId ? residentById.get(residentId) : undefined;
    const residentName = resolvedOwnerFromResident?.fullName;
    const rawOwner = hasReadableText(item.owner)
      ? String(item.owner)
      : hasReadableText(item.ownerEmail)
        ? String(item.ownerEmail)
        : resolvedOwnerFromResident?.fullName || "";
    const owner = rawOwner && !looksLikeOpaqueId(rawOwner) ? rawOwner : t("common.notSpecified");
    const tenantNames = Array.isArray(item.tenants)
      ? item.tenants
          .map((tenant) => {
            if (!tenant || typeof tenant !== "object") return "";
            const record = tenant as Record<string, unknown>;
            const firstName = hasReadableText(record.firstName) ? record.firstName.trim() : "";
            const lastName = hasReadableText(record.lastName) ? record.lastName.trim() : "";
            const fullName = [firstName, lastName].filter(Boolean).join(" ");
            return hasReadableText(record.fullName)
              ? record.fullName.trim()
              : hasReadableText(record.name)
                ? record.name.trim()
                : fullName || (hasReadableText(record.email) ? record.email.trim() : "");
          })
          .filter((value) => value && !looksLikeOpaqueId(value))
      : [];
    const responsiblePerson = tenantNames.length > 0
      ? owner !== t("common.notSpecified")
        ? `${owner} / ${tenantNames.join(", ")}`
        : tenantNames.join(", ")
      : owner;
    const tenantPhones = Array.isArray(item.tenants)
      ? item.tenants
          .map((tenant) => {
            if (!tenant || typeof tenant !== "object") return "";
            const record = tenant as Record<string, unknown>;
            return hasReadableText(record.phone) ? record.phone.trim() : "";
          })
          .filter(Boolean)
      : [];
    const phoneValues = [
      item.ownerPhone,
      item.residentPhone,
      item.phone,
      item.phoneNumber,
      resolvedOwnerFromResident?.phone,
      ...tenantPhones,
    ].filter(hasReadableText);
    const phoneLabel = Array.from(new Set(phoneValues.map((value) => value.trim()))).join(" / ");
    const buildingLocked = hasReadableText(item.buildingId) && lockedBuildingIds.has(String(item.buildingId).trim());

    return [
      id !== "—" ? (
        <Link
          key={`${id}-apt`}
          href={`${ROUTES.apartments}/${encodeURIComponent(id)}`}
          className="font-medium text-blue-600 hover:underline"
        >
          {String(item.number ?? item.id ?? "—")}
        </Link>
      ) : (
        <span key={`${id}-apt`} className="font-medium text-slate-900">
          {String(item.number ?? item.id ?? "—")}
        </span>
      ),
      responsiblePerson,
      area,
      declaredResidents,
      floor,
      <span
        key={`${id}-status`}
        className={`rounded-full px-2.5 py-1 text-xs font-medium ${getStatusClassName(occupancyStatus)}`}
      >
        {status}
      </span>,
      id !== "—" ? (
        <ApartmentsManagementRowActions
          apartmentId={id}
          apartmentLabel={String(item.number ?? item.id ?? id)}
          apartmentRecord={item}
          currentResidentId={residentId}
          currentResidentName={residentName}
          isOccupied={occupancyStatus === "occupied"}
          residentOptions={residentOptions}
          readOnly={buildingLocked}
        />
      ) : (
        <span key={`${id}-empty`} className="text-xs text-slate-400">—</span>
      ),
      phoneLabel ? (
        <span key={`${id}-phone`} className="font-medium text-slate-800">
          {phoneLabel}
        </span>
      ) : null,
    ];
  }), [filteredApartments, lockedBuildingIds, residentById, residentOptions, t]);

  return (
    <div className="space-y-6">
      <SectionCard
        title={t("management.registryTitle")}
        titleMeta={selectedBuildingLabel ? (
          <span className={`inline-flex max-w-full items-center rounded-full border px-3 py-1 text-sm font-medium ${
            selectedBuildingLocked
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-blue-100 bg-blue-50 text-blue-700"
          }`}>
            <span className="truncate">{selectedBuildingLabel}</span>
            {selectedBuildingLocked ? <span className="ml-2 shrink-0 text-xs font-semibold">Locked</span> : null}
          </span>
        ) : null}
        description={t("management.registryDescription")}
        titleAside={buildingOptions.length > 1 ? (
          <RegistryBuildingFilter
            label={t("management.filters.building")}
            allLabel={t("management.filters.allBuildings")}
            options={buildingOptions}
            value={normalizedBuildingId}
            onChange={setSelectedBuildingId}
          />
        ) : null}
        titleAsidePlacement="below"
        headerAside={
          <ApartmentsManagementActionsMenu
            companyId={data.companyId}
            buildings={menuBuildingOptions}
            selectedBuildingId={normalizedBuildingId}
            apartments={managementMenuApartments}
            apartmentRecords={filteredApartments}
            lockedBuildingIds={lockedBuildingIds}
          />
        }
      >
        {rows.length > 0 ? (
          <DataTable
            columns={[
              t("management.columns.apartment"),
              t("management.columns.responsiblePerson"),
              t("management.columns.area"),
              t("management.columns.declaredResidents"),
              t("management.columns.floor"),
              t("management.columns.status"),
              t("management.columns.actions"),
              t("tenantAccess.fields.phone"),
            ]}
            rows={rows}
            desktopHiddenColumns={[7]}
            mobileColumnLabels={{
              0: t("management.mobile.apartmentAbbr"),
              1: t("management.mobile.responsiblePersonAbbr"),
            }}
            mobileCompactSummary={{
              primaryColumn: 0,
              secondaryColumn: 1,
              statusColumn: 5,
            }}
            mobileCollapsibleColumns={[7, 2, 3, 4, 6]}
            mobileCollapsibleIconOnly
            mobileCollapsibleLabel={t("management.mobile.details")}
          />
        ) : (
          <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-8 text-center text-sm text-slate-500">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
              <FaBuilding className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="mt-4 font-medium text-slate-700">
              {hasBuildings ? t("management.noApartments") : t("management.noBuildings")}
            </p>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
