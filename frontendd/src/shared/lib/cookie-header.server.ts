import "server-only";

import { cookies } from "next/headers";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

const COOKIE_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const COOKIE_VALUE_PATTERN = /^[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]*$/;

function toCookieHeaderValue(value: string): string {
  const trimmed = value.trim();

  if (COOKIE_VALUE_PATTERN.test(trimmed)) {
    return trimmed;
  }

  try {
    return encodeURIComponent(decodeURIComponent(trimmed));
  } catch {
    return encodeURIComponent(trimmed);
  }
}

export function buildCookieHeaderFromStore(store: CookieStore): string {
  return store
    .getAll()
    .filter((item) => COOKIE_NAME_PATTERN.test(item.name))
    .map((item) => `${item.name}=${toCookieHeaderValue(item.value)}`)
    .join("; ");
}

export async function buildRequestCookieHeader(): Promise<string> {
  return buildCookieHeaderFromStore(await cookies());
}
