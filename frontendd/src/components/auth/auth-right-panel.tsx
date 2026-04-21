import { getTranslations } from "next-intl/server";

export async function AuthRightPanel() {
  const t = await getTranslations("auth");

  const features = [
    t("rightPanelFeature1"),
    t("rightPanelFeature2"),
    t("rightPanelFeature3"),
  ];

  return (
    <div className="flex h-full flex-1 flex-col justify-center bg-linear-to-br from-blue-600 via-violet-600 to-purple-700 px-12 py-16 xl:px-16">
      <div className="max-w-sm">
        <span className="inline-block rounded-full border border-white/30 px-3 py-1 text-[11px] font-semibold tracking-widest text-white/80">
          {t("rightPanelBadge")}
        </span>

        <h2 className="mt-8 text-4xl font-extrabold leading-tight text-white xl:text-5xl">
          {t("rightPanelTitle")}
        </h2>

        <p className="mt-5 text-base leading-relaxed text-blue-100">
          {t("rightPanelDesc")}
        </p>

        <div className="mt-10 flex flex-col gap-3">
          {features.map((feature) => (
            <div
              key={feature}
              className="flex items-center gap-3 rounded-2xl bg-white/10 px-5 py-3.5 backdrop-blur-sm"
            >
              <svg
                className="h-4 w-4 shrink-0 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm leading-snug text-white/90">{feature}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
