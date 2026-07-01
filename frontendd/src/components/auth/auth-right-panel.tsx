import { getTranslations } from "next-intl/server";
import { FiCheckCircle, FiCloud, FiShield } from "react-icons/fi";

export async function AuthRightPanel() {
  const t = await getTranslations("auth");

  const features = [
    t("rightPanelFeature1"),
    t("rightPanelFeature2"),
    t("rightPanelFeature3"),
  ];

  return (
    <div className="flex h-full items-center justify-center">
      <div className="w-full overflow-hidden rounded-[28px] border border-blue-100 bg-linear-to-br from-white via-white to-blue-100/70 p-10 shadow-[0_32px_90px_rgba(37,99,235,0.16)] backdrop-blur-xl xl:p-12">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
            <FiCloud className="h-4 w-4 text-blue-600" aria-hidden />
            {t("rightPanelBadge")}
          </span>

          <h2 className="mt-7 max-w-2xl text-3xl font-bold leading-tight text-slate-950 xl:text-4xl">
          {t("rightPanelTitle")}
          </h2>

          <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">{t("rightPanelDesc")}</p>

          <div className="mt-9 flex flex-col gap-4">
            {features.map((feature) => (
              <div key={feature} className="flex items-start gap-3 text-sm leading-6 text-slate-700">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                  <FiShield className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span>{feature}</span>
              </div>
            ))}
          </div>

          <div className="mt-10 border-t border-slate-200 ">
          <div className="mt-8 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">
            <FiCheckCircle className="h-4 w-4" aria-hidden />
            Domera
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
