"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, invalidateDomeraClientQueries } from "@/shared/api/client";

type DomeraQueryState<T> = {
  data: T | undefined;
  error: Error | null;
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => Promise<T | undefined>;
};

type DomeraQueryOptions<T> = {
  enabled?: boolean;
  initialData?: T;
  staleTimeMs?: number;
  redirectOnAuthError?: boolean;
};

function toQueryPath(queryKey: readonly unknown[]) {
  const [path] = queryKey;
  if (typeof path !== "string" || !path.startsWith("/")) {
    throw new Error("Domera query keys must start with an API path.");
  }

  return path;
}

export function invalidateDomeraQuery(pathPrefix?: string) {
  invalidateDomeraClientQueries(pathPrefix);
}

export function useDomeraQuery<T>(
  queryKey: readonly unknown[],
  options: DomeraQueryOptions<T> = {},
): DomeraQueryState<T> {
  const { enabled = true, initialData, staleTimeMs, redirectOnAuthError } = options;
  const stableKey = useMemo(() => JSON.stringify(queryKey), [queryKey]);
  const path = useMemo(() => toQueryPath(queryKey), [queryKey]);
  const [data, setData] = useState<T | undefined>(initialData);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(enabled && initialData === undefined);
  const [isFetching, setIsFetching] = useState(false);

  const refetch = useCallback(async () => {
    if (!enabled) return data;

    setIsFetching(true);
    setError(null);

    try {
      const nextData = await apiFetch<T>(path, {
        staleTimeMs,
        redirectOnAuthError,
      });
      setData(nextData);
      return nextData;
    } catch (caughtError) {
      const nextError = caughtError instanceof Error ? caughtError : new Error(String(caughtError));
      setError(nextError);
      return undefined;
    } finally {
      setIsLoading(false);
      setIsFetching(false);
    }
  }, [data, enabled, path, redirectOnAuthError, staleTimeMs]);

  useEffect(() => {
    let active = true;

    if (!enabled) {
      setIsLoading(false);
      return;
    }

    setIsLoading(initialData === undefined);
    setIsFetching(true);
    setError(null);

    apiFetch<T>(path, {
      staleTimeMs,
      redirectOnAuthError,
    })
      .then((nextData) => {
        if (active) setData(nextData);
      })
      .catch((caughtError) => {
        if (!active) return;
        setError(caughtError instanceof Error ? caughtError : new Error(String(caughtError)));
      })
      .finally(() => {
        if (!active) return;
        setIsLoading(false);
        setIsFetching(false);
      });

    return () => {
      active = false;
    };
  }, [enabled, initialData, path, redirectOnAuthError, stableKey, staleTimeMs]);

  return {
    data,
    error,
    isLoading,
    isFetching,
    refetch,
  };
}
