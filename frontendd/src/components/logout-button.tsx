"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/shared/lib/routes";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

const cookieNames = [
  "__session",
  "domera_role",
  "domera_accountType",
  "domera_companyId",
  "domera_apartmentId",
  "authToken",
  "userId",
  "userEmail",
];

function clearBrowserCookies() {
  if (typeof document === "undefined") return;

  for (const name of cookieNames) {
    document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
  }
}

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);

    try {
      await fetch(`${apiBaseUrl}/auth/clear-cookies`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // continue with local cleanup even if the backend is unavailable
    } finally {
      clearBrowserCookies();
      router.push(ROUTES.login);
      router.refresh();
      setLoading(false);
    }
  }

  return (
    <Button type="button" variant="danger" onClick={handleLogout} disabled={loading}>
      {loading ? "Signing out..." : "Sign out"}
    </Button>
  );
}
