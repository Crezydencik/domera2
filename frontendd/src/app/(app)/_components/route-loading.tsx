"use client";

import { useEffect, useState } from "react";

export function RouteLoading({ rows = 3, delayMs = 250 }: { rows?: number; delayMs?: number }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setShow(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs]);

  if (!show) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="h-8 w-52 animate-pulse rounded-md bg-slate-200" />
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="space-y-3">
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="flex items-center gap-3">
              <div className="h-10 w-10 shrink-0 animate-pulse rounded-md bg-slate-100" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
