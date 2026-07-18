import type { NotificationItem } from "@/shared/lib/data";

export const BUILDINGS_CHANGED_EVENT = "domera:buildings-changed";
const ELECTRICITY_NAVIGATION_STORAGE_KEY = "domera:electricity-navigation-enabled";

export type BuildingsChangedDetail = {
  electricityEnabled?: boolean;
  electricitySetupItems?: NotificationItem[];
};

export function notifyBuildingsChanged(detail: BuildingsChangedDetail = {}) {
  if (typeof window === "undefined") return;
  if (typeof detail.electricityEnabled === "boolean") {
    const value = detail.electricityEnabled ? "1" : "0";
    window.sessionStorage.setItem(ELECTRICITY_NAVIGATION_STORAGE_KEY, value);
    window.localStorage.setItem(ELECTRICITY_NAVIGATION_STORAGE_KEY, value);
  }
  window.dispatchEvent(new CustomEvent<BuildingsChangedDetail>(BUILDINGS_CHANGED_EVENT, { detail }));
}

export function readStoredElectricityNavigation() {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(ELECTRICITY_NAVIGATION_STORAGE_KEY) === "1"
    || window.localStorage.getItem(ELECTRICITY_NAVIGATION_STORAGE_KEY) === "1";
}
