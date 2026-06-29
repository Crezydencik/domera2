export function isApprovedBuildingStatus(status: unknown): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  return normalized !== "pending" && normalized !== "rejected" && normalized !== "cancelled" && normalized !== "canceled";
}

export function isApprovedBuilding<T extends { status?: unknown }>(building: T): boolean {
  return isApprovedBuildingStatus(building.status);
}
