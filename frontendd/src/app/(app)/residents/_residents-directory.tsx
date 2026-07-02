"use client";

import { useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/data-table";
import { isApprovedBuilding } from "@/shared/lib/buildings";
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

interface ContactInfo {
  key: string;
  fullName: string;
  email: string;
  phone: string;
  role: string;
}

const EMPTY_CELL = "-";
const INACTIVE_TENANT_STATUSES = new Set(["cancelled", "canceled", "deleted", "expired", "inactive", "removed", "revoked"]);
const ACTIVE_TENANT_STATUSES = new Set(["accepted", "active"]);

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function looksLikeOpaqueId(value: string) {
  return /^[A-Za-z0-9_-]{12,}$/.test(value.trim());
}

function displayText(value: unknown) {
  if (!hasText(value)) return undefined;
  const trimmed = value.trim();
  return looksLikeOpaqueId(trimmed) ? undefined : trimmed;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (hasText(value)) {
      return value.trim();
    }
  }

  return EMPTY_CELL;
}

function optionalText(...values: unknown[]) {
  for (const value of values) {
    if (hasText(value)) {
      return value.trim();
    }
  }

  return "";
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

function parseDateValue(value: unknown) {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  if (typeof value === "object") {
    const record = value as UnknownRecord;
    const seconds = typeof record.seconds === "number"
      ? record.seconds
      : typeof record._seconds === "number"
        ? record._seconds
        : undefined;
    return typeof seconds === "number" ? new Date(seconds * 1000) : undefined;
  }

  return undefined;
}

function isCurrentByDates(record: UnknownRecord) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const from = parseDateValue(record.fromDate ?? record.validFrom ?? record.startDate);
  const until = parseDateValue(record.until ?? record.toDate ?? record.validUntil ?? record.endDate ?? record.expiresAt);

  if (from) {
    const fromDay = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    if (fromDay > today) return false;
  }

  if (until) {
    const untilDay = new Date(until.getFullYear(), until.getMonth(), until.getDate());
    if (untilDay < today) return false;
  }

  return true;
}

function isCurrentTenant(record: UnknownRecord) {
  const status = optionalText(record.status).toLowerCase();
  if (INACTIVE_TENANT_STATUSES.has(status)) return false;
  if (status && !ACTIVE_TENANT_STATUSES.has(status)) return false;

  return isCurrentByDates(record);
}

function joinContactField(values: string[]) {
  const unique = Array.from(new Set(values.map((value) => value.trim()).filter((value) => value && value !== EMPTY_CELL)));
  return unique.length ? unique.join(" / ") : EMPTY_CELL;
}

function mergeApartmentContacts(contacts: ContactInfo[]) {
  const byKey = new Map<string, ContactInfo>();

  for (const contact of contacts) {
    const key = contact.email !== EMPTY_CELL ? contact.email.toLowerCase() : contact.key;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...contact });
      continue;
    }

    existing.fullName = joinContactField([existing.fullName, contact.fullName]);
    existing.email = joinContactField([existing.email, contact.email]);
    existing.phone = joinContactField([existing.phone, contact.phone]);
    existing.role = joinContactField([existing.role, contact.role]);
  }

  return Array.from(byKey.values());
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
    () => data.buildings
      .filter(isApprovedBuilding)
      .map((building) => ({
        id: building.id,
        label: building.address !== EMPTY_CELL ? building.address : building.name,
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
    if (selectedBuildingId && !buildings.some((building) => building.id === selectedBuildingId)) {
      setSelectedBuildingId(buildings[0]?.id ?? "");
    }
  }, [buildings, selectedBuildingId]);

  const contacts = useMemo(() => {
    const rows: ContactRow[] = [];

    for (const apartment of data.apartments) {
      const buildingId = firstText(apartment.buildingId, "");
      const building = firstText(apartment.buildingName, apartment.building, apartment.address, buildingById.get(buildingId), buildingId);
      const label = apartmentLabel(apartment);
      const id = apartmentId(apartment);
      const apartmentContacts: ContactInfo[] = [];
      const ownerEmail = firstText(apartment.ownerEmail);
      const ownerName = firstText(
        joinName(apartment.ownerFirstName, apartment.ownerLastName),
        apartment.owner,
        apartment.ownerName,
        ownerEmail,
      );

      if (ownerEmail !== EMPTY_CELL || ownerName !== EMPTY_CELL) {
        apartmentContacts.push({
          key: firstText(apartment.ownerId, ownerEmail, `${id}-owner`),
          fullName: ownerName,
          email: ownerEmail,
          phone: firstText(apartment.ownerPhone),
          role: "Īpašnieks",
        });
      }

      if (Array.isArray(apartment.tenants)) {
        for (const tenant of apartment.tenants) {
          if (!tenant || typeof tenant !== "object") continue;
          const record = tenant as UnknownRecord;
          if (!isCurrentTenant(record)) continue;

          const tenantId = hasText(record.userId) ? record.userId.trim() : "";
          const tenantProfile = tenantId ? residentById.get(tenantId) : undefined;
          const email = firstText(record.email, tenantProfile?.email);
          const fullName = firstText(
            joinName(record.firstName, record.lastName),
            record.fullName,
            record.name,
            displayText(tenantProfile?.fullName),
            email,
          );

          apartmentContacts.push({
            key: firstText(tenantId, email, `${id}-${fullName}`),
            fullName,
            email,
            phone: firstText(record.phone, tenantProfile?.phone),
            role: "Īrnieks",
          });
        }
      }

      const mergedContacts = mergeApartmentContacts(apartmentContacts);
      if (!mergedContacts.length) continue;

      rows.push({
        key: id,
        building,
        apartment: label,
        fullName: joinContactField(mergedContacts.map((contact) => contact.fullName)),
        email: joinContactField(mergedContacts.map((contact) => contact.email)),
        phone: joinContactField(mergedContacts.map((contact) => contact.phone)),
        role: joinContactField(mergedContacts.map((contact) => contact.role)),
        buildingId,
      });
    }

    return rows
      .filter((row) => !effectiveBuildingId || row.buildingId === effectiveBuildingId)
      .sort(compareApartment);
  }, [buildingById, data.apartments, effectiveBuildingId, residentById]);

  return (
    <div className="space-y-4">
      {buildings.length > 1 && (
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
          mobileColumnPairs={[[0, 2]]}
          rows={contacts.map((contact) => [
            <span key={`${contact.key}-apartment`} className="font-medium text-slate-900">{contact.apartment}</span>,
            <span key={`${contact.key}-name`} className="block min-w-0 break-words text-slate-900">{contact.fullName}</span>,
            <span key={`${contact.key}-role`} className="block min-w-0 break-words">{contact.role}</span>,
            <span key={`${contact.key}-email`} className="block min-w-0 break-all">{contact.email}</span>,
            <span key={`${contact.key}-phone`} className="block min-w-0 break-words">{contact.phone}</span>,
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
