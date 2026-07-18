export function isApprovedBuildingStatus(status: unknown): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  return normalized !== "pending" && normalized !== "rejected" && normalized !== "cancelled" && normalized !== "canceled";
}

export function isApprovedBuilding<T extends { status?: unknown }>(building: T): boolean {
  return isApprovedBuildingStatus(building.status);
}

export function isElectricityEnabledBuilding<T extends { status?: unknown; readingConfig?: unknown; electricityEnabled?: unknown }>(
  building: T,
): boolean {
  if (!isApprovedBuildingStatus(building.status)) {
    return false;
  }

  if (building.electricityEnabled === true) {
    return true;
  }

  const readingConfig = building.readingConfig;
  if (!readingConfig || typeof readingConfig !== "object" || Array.isArray(readingConfig)) {
    return false;
  }

  return Boolean((readingConfig as { electricityEnabled?: unknown }).electricityEnabled);
}
