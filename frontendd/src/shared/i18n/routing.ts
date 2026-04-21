import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["lv", "ru", "en"],
  defaultLocale: "lv",
  localePrefix: "never",
});
