export const BUILDING_CREATION_REQUESTS_CHANGED_EVENT = "domera:building-creation-requests-changed";

export function notifyBuildingCreationRequestsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(BUILDING_CREATION_REQUESTS_CHANGED_EVENT));
}
