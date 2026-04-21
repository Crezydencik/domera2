const appConfig = {
  name: "Domera",
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api",
};

export class DomeraApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "DomeraApiError";
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;

  const response = await fetch(`${appConfig.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(init?.headers ?? {}),
    },
    credentials: "include",
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as T | Record<string, unknown> | null;

  if (!response.ok) {
    const errorPayload = (payload && typeof payload === "object" ? payload : {}) as {
      message?: string | string[];
      error?: string;
    };

    const messageValue = Array.isArray(errorPayload.message)
      ? errorPayload.message.join(", ")
      : errorPayload.message || errorPayload.error || `Request failed for ${path}`;

    throw new DomeraApiError(String(messageValue), response.status);
  }

  return payload as T;
}
