export function isApprovedBuildingStatus(status: unknown): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();

  return [
    "active",
    "approved",
    "healthy",
    "confirmed",
    "активно",
    "активный",
    "одобрено",
    "подтверждено",
    "aktīvs",
    "aktiva",
    "apstiprināts",
    "apstiprinata",
  ].includes(normalized);
}

export function isApprovedBuilding<T extends { status?: unknown; editLocked?: unknown }>(building: T): boolean {
  if (building.editLocked === true) {
    return false;
  }

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
