"use client";

import { useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/data-table";
import type { RoleDataBundle } from "@/shared/lib/domera-api.server";

type UnknownRecord = Record<string, unknown>;

interface ResidentsDirectoryProps {
  data: RoleDataBundle;
  labels: {
    apartment: string;
    fullName: string;
    email: string;
    phone: string;
    building: string;
    role: string;
    allBuildings: string;
    empty: string;
  };
}

interface ContactRow {
  key: string;
  apartment: string;
  fullName: string;
  email: string;
  phone: string;
  role: string;
  buildingId: string;
  building: string;
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (hasText(value)) {
      return value.trim();
    }
  }

  return "-";
}

function joinName(...values: unknown[]) {
  const parts = values.filter(hasText).map((value) => value.trim());
  return parts.length ? parts.join(" ") : undefined;
}

function apartmentLabel(apartment: UnknownRecord) {
  return firstText(apartment.number, apartment.apartmentNumber, apartment.id, apartment.apartmentId);
}

function apartmentId(apartment: UnknownRecord) {
  return firstText(apartment.id, apartment.apartmentId, apartment.number, apartment.apartmentNumber);
}

function compareApartment(left: ContactRow, right: ContactRow) {
  const leftNumber = Number(left.apartment);
  const rightNumber = Number(right.apartment);

  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }

  return left.apartment.localeCompare(right.apartment, undefined, { numeric: true, sensitivity: "base" })
    || left.fullName.localeCompare(right.fullName, undefined, { sensitivity: "base" });
}

export function ResidentsDirectory({ data, labels }: ResidentsDirectoryProps) {
  const [selectedBuildingId, setSelectedBuildingId] = useState("");

  const residentById = useMemo(
    () => new Map(data.residents.map((resident) => [resident.id, resident])),
    [data.residents],
  );

  const buildings = useMemo(
    () => [...data.buildings]
      .map((building) => ({
        id: building.id,
        label: building.address !== "-" ? building.address : building.name,
      }))
      .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: "base" })),
    [data.buildings],
  );

  const buildingById = useMemo(
    () => new Map(buildings.map((building) => [building.id, building.label])),
    [buildings],
  );
  const effectiveBuildingId = selectedBuildingId || buildings[0]?.id || "";

  useEffect(() => {
    if (!selectedBuildingId && buildings[0]?.id) {
      setSelectedBuildingId(buildings[0].id);
    }
  }, [buildings, selectedBuildingId]);

  const contacts = useMemo(() => {
    const seen = new Set<string>();
    const rows: ContactRow[] = [];

    function pushContact(contact: ContactRow) {
      const key = `${contact.apartment}:${contact.email}:${contact.fullName}:${contact.key}`;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push(contact);
    }

    for (const apartment of data.apartments) {
      const buildingId = firstText(apartment.buildingId, "");
      const building = firstText(apartment.buildingName, apartment.building, apartment.address, buildingById.get(buildingId), buildingId);
      const label = apartmentLabel(apartment);
      const id = apartmentId(apartment);
      const ownerEmail = firstText(apartment.ownerEmail);
      const ownerName = firstText(
        joinName(apartment.ownerFirstName, apartment.ownerLastName),
        apartment.owner,
        apartment.ownerName,
        ownerEmail,
      );

      if (ownerEmail !== "-" || ownerName !== "-") {
        pushContact({
          key: firstText(apartment.ownerId, ownerEmail, `${id}-owner`),
          building,
          apartment: label,
          fullName: ownerName,
          email: ownerEmail,
          phone: firstText(apartment.ownerPhone),
          role: "Īpašnieks",
          buildingId,
        });
      }

      const residentId = hasText(apartment.residentId) ? apartment.residentId.trim() : "";
      const residentProfile = residentId ? residentById.get(residentId) : undefined;
      const residentEmail = firstText(apartment.residentEmail, residentProfile?.email);
      const residentName = firstText(
        joinName(apartment.residentFirstName, apartment.residentLastName),
        apartment.residentName,
        residentProfile?.fullName,
        residentEmail,
        residentId,
      );

      if (residentId || residentEmail !== "-" || residentName !== "-") {
        pushContact({
          key: residentId || residentEmail,
          building,
          apartment: label,
          fullName: residentName,
          email: residentEmail,
          phone: firstText(apartment.residentPhone, residentProfile?.phone),
          role: "Iedzīvotājs",
          buildingId,
        });
      }

      if (!Array.isArray(apartment.tenants)) continue;

      for (const tenant of apartment.tenants) {
        if (!tenant || typeof tenant !== "object") continue;
        const record = tenant as UnknownRecord;
        const email = firstText(record.email);
        const fullName = firstText(joinName(record.firstName, record.lastName), record.fullName, record.name, email);

        pushContact({
          key: firstText(record.userId, email, `${id}-${fullName}`),
          building,
          apartment: label,
          fullName,
          email,
          phone: firstText(record.phone),
          role: "Īrnieks",
          buildingId,
        });
      }
    }

    return rows
      .filter((row) => !effectiveBuildingId || row.buildingId === effectiveBuildingId)
      .sort(compareApartment);
  }, [buildingById, data.apartments, effectiveBuildingId, residentById]);

  return (
    <div className="space-y-4">
      {buildings.length > 0 && (
        <div className="w-full max-w-md">
          <label className="mb-1 block text-xs font-semibold uppercase text-slate-500" htmlFor="residents-building-filter">
            {labels.building}
          </label>
          <select
            id="residents-building-filter"
            value={effectiveBuildingId}
            onChange={(event) => setSelectedBuildingId(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-900 outline-none transition hover:border-slate-300 hover:bg-white focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
          >
            {buildings.map((building) => (
              <option key={building.id} value={building.id}>
                {building.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {contacts.length > 0 ? (
        <DataTable
          columns={[labels.apartment, labels.fullName, labels.role, labels.email, labels.phone]}
          rows={contacts.map((contact) => [
            <span key={`${contact.key}-apartment`} className="font-medium text-slate-900">{contact.apartment}</span>,
            contact.fullName,
            contact.role,
            contact.email,
            contact.phone,
          ])}
        />
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
          {labels.empty}
        </div>
      )}
    </div>
  );
}
