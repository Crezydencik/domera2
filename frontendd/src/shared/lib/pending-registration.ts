import type { PublicAccountType } from "@/shared/api/auth";

const STORAGE_KEY = "domera_pending_registration";

export type PendingRegistration = {
  email: string;
  password: string;
  accountType: PublicAccountType;
  firstName: string;
  lastName: string;
  phone: string;
  companyName: string;
  companyEmail: string;
  registrationNumber: string;
  acceptedPrivacyPolicy: boolean;
  acceptedTerms: boolean;
  createdAt: number;
};

export function savePendingRegistration(payload: Omit<PendingRegistration, "createdAt">) {
  if (typeof window === "undefined") return;

  const value: PendingRegistration = {
    ...payload,
    email: payload.email.trim().toLowerCase(),
    createdAt: Date.now(),
  };

  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function loadPendingRegistration(): PendingRegistration | null {
  if (typeof window === "undefined") return null;

  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as PendingRegistration;
  } catch {
    window.sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function clearPendingRegistration() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}
