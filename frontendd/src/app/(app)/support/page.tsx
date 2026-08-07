import { redirect } from "next/navigation";
import { LifeBuoy, Phone, UserRound } from "lucide-react";
import { ROUTES } from "@/shared/lib/routes";
import { getAuthenticatedContext } from "@/shared/server/auth-context";
import { SupportFeedbackForm } from "./support-feedback-form";
import { SupportInbox } from "./support-inbox";

export default async function SupportPage() {
  const context = await getAuthenticatedContext(undefined, { requireFreshProfile: true });

  if (context.role === "platformAdmin") {
    return (
      <div className="mx-auto max-w-6xl">
        <SupportInbox />
      </div>
    );
  }

  if (context.role !== "managementCompany") {
    redirect(ROUTES.dashboard);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm shadow-slate-950/[0.03]">
        <div className="border-b border-slate-100 bg-sky-50/70 px-5 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white text-sky-700 shadow-sm ring-1 ring-sky-100">
              <LifeBuoy className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-sky-700">Support</p>
              <h2 className="mt-1 text-2xl font-semibold text-slate-950">Need help?</h2>
            </div>
          </div>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">
            Contact your Domera support person directly for management company questions.
          </p>
        </div>

        <div className="grid gap-0 md:grid-cols-[1fr_auto]">
          <div className="p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-lg font-semibold text-white">
                DK
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                  Contact person
                </div>
                <p className="mt-2 text-xl font-semibold text-slate-950">Deniss Kargins</p>
                <p className="mt-1 text-sm text-slate-500">Domera support contact</p>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 p-5 md:border-l md:border-t-0">
            <div className="min-w-64 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                Phone
              </div>
              <p className="mt-2 text-lg font-semibold text-slate-950">+37129992017</p>
              <a
                href="tel:+37129992017"
                className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
              >
                <Phone className="h-4 w-4" aria-hidden="true" />
                Call support
              </a>
            </div>
          </div>
        </div>
      </section>

      <SupportFeedbackForm />
    </div>
  );
}
