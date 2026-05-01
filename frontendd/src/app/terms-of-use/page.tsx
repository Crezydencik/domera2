import { getTranslations } from "next-intl/server";

export default async function TermsOfUsePage() {
  const t = await getTranslations("auth");

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">{t("termsOfUseTitle")}</h1>
        <p className="text-sm text-slate-500">{t("termsOfUseSubtitle")}</p>
      </header>

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-sm leading-6 text-slate-700">
        <section>
          <h2 className="font-semibold text-slate-900">{t("termsOfUseSectionAccessTitle")}</h2>
          <p>{t("termsOfUseSectionAccessBody")}</p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-900">{t("termsOfUseSectionResponsibilitiesTitle")}</h2>
          <p>{t("termsOfUseSectionResponsibilitiesBody")}</p>
        </section>
        <section>
          <h2 className="font-semibold text-slate-900">{t("termsOfUseSectionRestrictionsTitle")}</h2>
          <p>{t("termsOfUseSectionRestrictionsBody")}</p>
        </section>
      </div>
    </div>
  );
}