import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async () => {
  const store = await cookies();
  const cookie = store.get("NEXT_LOCALE")?.value;
  const locale =
    cookie && routing.locales.includes(cookie as (typeof routing.locales)[number])
      ? cookie
      : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../../messages/${locale}.json`)).default,
  };
});
