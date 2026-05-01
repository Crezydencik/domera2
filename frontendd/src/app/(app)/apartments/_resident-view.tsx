import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { SectionCard } from "@/components/section-card";
import type { RoleDataBundle } from "@/shared/lib/domera-api.server";
import { ROUTES } from "@/shared/lib/routes";
import { TenantAccessManager } from "./[apartmentId]/tenant-access-manager";

export async function ApartmentsResidentView({ data }: { data: RoleDataBundle }) {
  const t = await getTranslations("apartments");
  const apartments = data.apartments.length ? data.apartments : [];

  if (!apartments.length) {
    return (
      <div className="space-y-6">
        <SectionCard title={t("resident.emptyTitle")} description={t("resident.emptyDescription")}>
          <p className="text-sm text-slate-500">
            {t("resident.emptyHint")}
          </p>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title={data.role === "landlord" ? t("resident.landlordTitle") : t("resident.residentTitle")}
        description={
          data.role === "landlord"
            ? t("resident.landlordDescription")
            : t("resident.residentDescription")
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {apartments.map((item) => {
            const id = String(item.id ?? item.apartmentId ?? item.number ?? "");
            const label = String(item.number ?? item.id ?? "—");
            const address = String(item.address ?? item.buildingId ?? t("common.addressNotSpecified"));
            const floor = String(item.floor ?? item.level ?? "—");
            const rooms = String(item.rooms ?? item.roomCount ?? "—");
            const area = String(item.area ?? item.squareMeters ?? "—");

            return (
              <div
                key={id || label}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
              >
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{t("common.apartment")}</p>
                <p className="text-2xl font-bold text-slate-900">№ {label}</p>
                <p className="mt-1 text-sm text-slate-500">{address}</p>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-slate-50 px-2 py-2">
                    <p className="text-xs text-slate-400">{t("common.floor")}</p>
                    <p className="text-sm font-semibold text-slate-800">{floor}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-2 py-2">
                    <p className="text-xs text-slate-400">{t("common.rooms")}</p>
                    <p className="text-sm font-semibold text-slate-800">{rooms}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-2 py-2">
                    <p className="text-xs text-slate-400">{t("common.area")}</p>
                    <p className="text-sm font-semibold text-slate-800">{area}</p>
                  </div>
                </div>

                {id && (
                  <Link
                    href={`${ROUTES.apartments}/${encodeURIComponent(id)}`}
                    className="mt-4 block w-full rounded-xl border border-slate-200 py-2 text-center text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    {t("common.viewDetails")}
                  </Link>
                )}

                {data.role === "landlord" && id && (
                  <div className="mt-4">
                    <TenantAccessManager apartmentId={id} apartmentLabel={label} compact />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}
