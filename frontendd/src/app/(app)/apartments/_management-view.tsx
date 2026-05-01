"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
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

export function ApartmentsManagementView({
  data,
}: {
  data: RoleDataBundle;
}) {
  const t = useTranslations("apartments");
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | undefined>(undefined);

  const residentById = useMemo(
    () => new Map(data.residents.map((resident) => [resident.id, resident])),
    [data.residents],
  );
  const buildingOptions: RegistryBuildingOption[] = useMemo(
    () => [...data.buildings]
      .map((building) => ({
        id: building.id,
        label: building.address !== "—" ? building.address : building.name,
      }))
      .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base", numeric: true })),
    [data.buildings],
  );
  const menuBuildingOptions: ManagementActionBuildingOption[] = useMemo(
    () => [...data.buildings]
      .map((building) => ({
        id: building.id,
        label: building.address !== "—" ? building.address : building.name,
        readingConfig: building.readingConfig,
      }))
      .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base", numeric: true })),
    [data.buildings],
  );
  const normalizedBuildingId = typeof selectedBuildingId === "string" && selectedBuildingId.trim()
    ? selectedBuildingId.trim()
    : undefined;
  const selectedBuildingLabel = useMemo(
    () => buildingOptions.find((building) => building.id === normalizedBuildingId)?.label,
    [buildingOptions, normalizedBuildingId],
  );
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
      status: residentId || (Array.isArray(item.tenants) && item.tenants.length > 0) ? t("management.occupied") : t("management.vacant"),
      residentId,
    };
  }), [filteredApartments, residentById, t]);

  const rows = useMemo(() => [...filteredApartments].sort((a, b) => compareApartmentOrder(a, b)).map((item) => {
    const id = String(item.id ?? item.apartmentId ?? item.number ?? "—");
    const tenants = Array.isArray(item.tenants) ? item.tenants.length : 0;
    const isOccupied = Boolean(item.residentId || tenants > 0);
    const status = isOccupied ? t("management.occupied") : t("management.vacant");
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
      owner,
      area,
      declaredResidents,
      floor,
      <span
        key={`${id}-status`}
        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
          isOccupied
            ? "bg-emerald-100 text-emerald-700"
            : "bg-slate-100 text-slate-600"
        }`}
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
          residentOptions={residentOptions}
        />
      ) : (
        <span key={`${id}-empty`} className="text-xs text-slate-400">—</span>
      ),
    ];
  }), [filteredApartments, residentById, residentOptions, t]);

  return (
    <div className="space-y-6">
      <SectionCard
        title={t("management.registryTitle")}
        titleMeta={selectedBuildingLabel ? (
          <span className="inline-flex max-w-full items-center rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
            <span className="truncate">{selectedBuildingLabel}</span>
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
            ]}
            rows={rows}
          />
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
            <p className="font-medium text-slate-700">{t("management.noApartments")}</p>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
