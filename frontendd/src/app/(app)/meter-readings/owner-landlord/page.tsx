"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useAuthSession } from "@/shared/hooks/use-auth";
import { SectionCard } from "@/components/section-card";
import { apiFetch } from "@/shared/api/client";

interface MeterReading {
  id: string;
  apartment: string;
  meters: { name: string; code: string }[];
  currentValue: string;
  previousValue: string;
  consumption: string;
  submittedAt: string;
  status: "submitted" | "pending" | "verified";
}

export default function OwnerLandlordPage() {
  const t = useTranslations("meterReadings");
  const session = useAuthSession();
  const [meterReadings, setMeterReadings] = useState<MeterReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (!session.isAuthenticated) {
          console.warn("Not authenticated", session);
          setError("Not authenticated. Please log in.");
          setLoading(false);
          return;
        }

        console.log("Current session:", session);
        setLoading(true);

        // Таймаут на запрос (5 сек)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          console.warn("Request timeout");
          controller.abort();
        }, 5000);

        // First, get resident apartments
        console.log("Fetching apartments...");
        const apartmentsResponse = await apiFetch<any>("/resident/apartments", {
          signal: controller.signal,
        });
        
        console.log("Apartments response:", apartmentsResponse);
        
        const apartmentIds = apartmentsResponse?.apartments
          ?.map((apt: any) => apt.id || apt.apartmentId)
          .filter((id: string) => id && id !== "—") || [];

        console.log("Apartment IDs extracted:", apartmentIds);

        if (apartmentIds.length === 0) {
          clearTimeout(timeoutId);
          console.warn("No apartments found");
          setMeterReadings([]);
          setLoading(false);
          return;
        }

        // Fetch meter readings for each apartment
        console.log("Fetching meter readings for apartments...");
        const meterBatches = await Promise.all(
          apartmentIds.map((aptId: string) => {
            console.log(`Fetching readings for apartment: ${aptId}`);
            return apiFetch<any>(`/meter-readings?apartmentId=${encodeURIComponent(aptId)}`, {
              signal: controller.signal,
            }).catch((err) => {
              console.error(`Error fetching readings for ${aptId}:`, err);
              return { items: [] };
            });
          })
        );

        clearTimeout(timeoutId);

        console.log("All meter batches:", meterBatches);

        const readings: MeterReading[] = meterBatches
          .flatMap((response) => {
            const items = Array.isArray(response) ? response : response?.items || [];
            return items;
          })
          .map((item: any) => {
            const date = item.submittedAt ? new Date(item.submittedAt) : null;
            const formattedDate = date
              ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
              : "—";
            return {
              id: item.id || item.meterId,
              apartment: item.apartment || item.apartmentNumber || item.apartmentId,
              meters: item.meters || [{ name: "Water", code: item.meterCode || "—" }],
              currentValue: item.currentValue || item.value || "0",
              previousValue: item.previousValue || "0",
              consumption: item.consumption || item.currentValue || "0",
              submittedAt: formattedDate,
              status: item.status || "submitted",
            };
          });

        console.log("Parsed readings:", readings);
        setMeterReadings(readings);
        setError(null);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Failed to load meter readings";
        console.error("Fetch error:", err, errorMsg);
        setError(`Error: ${errorMsg}. Check console for details.`);
        setMeterReadings([]);
      } finally {
        setLoading(false);
      }
    };

    if (session.isAuthenticated) {
      fetchData();
    } else {
      console.log("Waiting for authentication...");
    }
  }, [session.isAuthenticated]);

  const paginatedReadings = meterReadings.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );
  const totalPages = Math.ceil(meterReadings.length / pageSize);

  return (
    <div className="space-y-6">
      <SectionCard title={t("ownerLandlordTitle")} description={t("ownerLandlordDescription")}>
        {/* Action Buttons */}
        <div className="mb-6 flex gap-2">
          <button className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <span>+</span> Submit Reading
          </button>
          <button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
            ↓ Export
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-8 text-center">
            <div className="text-slate-600">
              <div className="mb-2 text-lg font-medium">⏳ Loading your meter readings...</div>
              <div className="text-sm text-slate-500">
                UserId: <code className="bg-white px-2 py-1 rounded">{session.userId || "none"}</code>
              </div>
              <div className="mt-3 inline-block">
                <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-r-transparent rounded-full mx-auto"></div>
              </div>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-8">
            <div className="text-red-900">
              <div className="mb-2 font-semibold">❌ Error loading data</div>
              <div className="mb-3 text-sm">{error}</div>
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-red-100 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-200"
              >
                🔄 Retry
              </button>
              <details className="mt-4 text-sm">
                <summary className="cursor-pointer font-medium">Debug Info</summary>
                <pre className="mt-2 overflow-auto bg-white rounded p-2 text-xs border border-red-200">
                  {JSON.stringify(
                    {
                      session: {
                        isAuthenticated: session.isAuthenticated,
                        userId: session.userId,
                        role: session.role,
                      },
                    },
                    null,
                    2
                  )}
                </pre>
              </details>
            </div>
          </div>
        ) : meterReadings.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Apartment</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Meters</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Readings</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {paginatedReadings.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-4 font-medium text-slate-900">
                      <div className="font-semibold">{item.apartment}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="space-y-1">
                        {item.meters.map((meter, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <span
                              className={`inline-block h-2 w-2 rounded-full ${
                                idx === 0 ? "bg-blue-500" : "bg-red-500"
                              }`}
                            ></span>
                            <span className="text-slate-600">{meter.name}</span>
                            <span className="text-xs text-slate-400">({meter.code})</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="space-y-2">
                        <div className="text-xs text-slate-500">
                          <div>Current: {item.currentValue}</div>
                          <div>Previous: {item.previousValue}</div>
                          <div className="font-semibold text-slate-700">
                            Consumption: {item.consumption} m³
                          </div>
                        </div>
                        <div className="text-xs text-slate-400">{item.submittedAt}</div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-center gap-2">
                        <button className="rounded-lg border border-slate-200 p-2 text-slate-400 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500">
                          📋
                        </button>
                        <button className="rounded-lg border border-slate-200 p-2 text-slate-400 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500">
                          ✏️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center text-slate-500 py-8">No meter readings available</p>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 disabled:text-slate-300 hover:bg-slate-50"
            >
              ←
            </button>
            <span className="text-sm text-slate-600">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 disabled:text-slate-300 hover:bg-slate-50"
            >
              →
            </button>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
