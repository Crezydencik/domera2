"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { clearBrowserAuthCookies } from "@/shared/lib/auth-session";
import { ROUTES } from "@/shared/lib/routes";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

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
      clearBrowserAuthCookies();
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
