"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { confirmAccountEmailChange } from "@/shared/api/auth";
import { ROUTES } from "@/shared/lib/routes";

type ConfirmationState = "loading" | "success" | "error";

export default function ConfirmEmailPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [state, setState] = useState<ConfirmationState>("loading");
  const [message, setMessage] = useState("Apstiprinām e-pasta maiņu...");

  useEffect(() => {
    let ignore = false;

    async function confirmEmail() {
      if (!token.trim()) {
        setState("error");
        setMessage("Apstiprināšanas saite nav derīga.");
        return;
      }

      try {
        const result = await confirmAccountEmailChange(token);
        if (ignore) return;

        setState("success");
        setMessage(`E-pasts ir apstiprināts${result.email ? `: ${result.email}` : "."}`);
      } catch (error) {
        if (ignore) return;

        setState("error");
        setMessage(error instanceof Error ? error.message : "Neizdevās apstiprināt e-pastu.");
      }
    }

    void confirmEmail();

    return () => {
      ignore = true;
    };
  }, [token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Domera</p>
        <h1 className="mt-3 text-2xl font-bold text-black">
          {state === "success" ? "E-pasts apstiprināts" : state === "error" ? "Neizdevās apstiprināt" : "Apstiprināšana"}
        </h1>
        <p className="mt-3 text-base leading-6 text-slate-700">{message}</p>
        <ButtonLink href={ROUTES.settings} variant="dark" size="pill" className="mt-6 text-sm font-bold">
          Atgriezties iestatījumos
        </ButtonLink>
      </section>
    </main>
  );
}
