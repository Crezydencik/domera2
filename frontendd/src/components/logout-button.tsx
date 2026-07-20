"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { signOutFirebaseAuth } from "@/shared/lib/auth-client";
import { clearBrowserAuthCookies } from "@/shared/lib/auth-session";
import { ROUTES } from "@/shared/lib/routes";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);

    try {
      clearBrowserAuthCookies();
      await signOutFirebaseAuth();
      window.location.assign(ROUTES.logout);
    } catch {
      router.replace(`${ROUTES.login}?expired=1`);
      router.refresh();
    }
  }

  return (
    <Button type="button" variant="danger" onClick={handleLogout} disabled={loading}>
      {loading ? "Signing out..." : "Sign out"}
    </Button>
  );
}
