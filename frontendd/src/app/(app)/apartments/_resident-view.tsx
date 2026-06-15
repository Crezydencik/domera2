import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SectionCard } from "@/components/section-card";
import type { RoleDataBundle } from "@/shared/lib/domera-api.server";
import { ROUTES } from "@/shared/lib/routes";

export async function ApartmentsResidentView({ data }: { data: RoleDataBundle }) {
  const t = await getTranslations("apartments");
  const apartments = data.apartments.length ? data.apartments : [];
  const fallback = "\u2014";

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

  const onlyApartmentId =
    apartments.length === 1
      ? String(apartments[0].id ?? apartments[0].apartmentId ?? apartments[0].number ?? "")
      : "";

  if (onlyApartmentId) {
    redirect(`${ROUTES.apartments}/${encodeURIComponent(onlyApartmentId)}`);
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
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {apartments.map((item) => {
            const id = String(item.id ?? item.apartmentId ?? item.number ?? "");
            const label = String(item.number ?? item.id ?? fallback);
            const floor = String(item.floor ?? item.level ?? fallback);
            const rooms = String(item.rooms ?? item.roomCount ?? fallback);
            const area = String(item.area ?? item.squareMeters ?? fallback);
            const apartmentContent = (
              <>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("common.apartment")}</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{"\u2116"} {label}</p>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center sm:w-80 sm:shrink-0">
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <p className="text-xs text-slate-400">{t("common.floor")}</p>
                    <p className="text-sm font-semibold text-slate-800">{floor}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <p className="text-xs text-slate-400">{t("common.rooms")}</p>
                    <p className="text-sm font-semibold text-slate-800">{rooms}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <p className="text-xs text-slate-400">{t("common.area")}</p>
                    <p className="text-sm font-semibold text-slate-800">{area}</p>
                  </div>
                </div>
              </>
            );

            return (
              <div key={id || label} className="border-b border-slate-200 last:border-b-0">
                {id ? (
                  <Link
                    href={`${ROUTES.apartments}/${encodeURIComponent(id)}`}
                    className="flex flex-col gap-4 p-4 transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                  >
                    {apartmentContent}
                  </Link>
                ) : (
                  <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                    {apartmentContent}
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
