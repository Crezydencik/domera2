"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useAuthSession } from "@/shared/hooks/use-auth";
import { DataTable } from "@/components/data-table";
import { SectionCard } from "@/components/section-card";
import { apiFetch } from "@/shared/api/client";

interface MeterReading {
  id: string;
  apartment: string;
  value: string;
  submittedAt: string;
  trend: string;
}

export default function ResidentPage() {
  const t = useTranslations("meterReadings");
  const session = useAuthSession();
  const [meterReadings, setMeterReadings] = useState<MeterReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    
    const fetchData = async () => {
      try {
        setLoading(true);

        // First, get resident apartments
        const apartmentsResponse = await apiFetch<any>("/resident/apartments");
        const apartmentIds = apartmentsResponse?.apartments
          ?.map((apt: any) => apt.id || apt.apartmentId)
          .filter((id: string) => id && id !== "—") || [];

        if (apartmentIds.length === 0) {
          setMeterReadings([]);
          return;
        }

        // Fetch meter readings for each apartment
        const meterBatches = await Promise.all(
          apartmentIds.map((aptId: string) =>
            apiFetch<any>(`/meter-readings?apartmentId=${encodeURIComponent(aptId)}`).catch(() => ({
              items: [],
            }))
          )
        );

        const readings: MeterReading[] = meterBatches
          .flatMap((response) => response?.items || [])
          .map((item: any) => {
            const date = item.submittedAt ? new Date(item.submittedAt) : null;
            const formattedDate = date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : "—";
            return {
              id: item.id || item.meterId,
              apartment: item.apartment || item.apartmentNumber || item.apartmentId,
              value: `${item.currentValue || item.value || item.consumption || 0} m³`,
              submittedAt: formattedDate,
              trend: `${item.consumption || item.currentValue || 0}`,
            };
          });

        setMeterReadings(readings);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load meter readings");
      } finally {
        setLoading(false);
      }
    };

    if (session.isAuthenticated) {
      fetchData();
    }
  }, [mounted, session.isAuthenticated]);

  if (!mounted) {
    return null;
  }

  if (loading) {
    return (
      <SectionCard title={t("ownerLandlordTitle")} description={t("ownerLandlordDescription")}>
        <div className="text-center text-slate-500">Loading...</div>
      </SectionCard>
    );
  }

  if (error) {
    return (
      <SectionCard title={t("ownerLandlordTitle")} description={t("ownerLandlordDescription")}>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title={t("ownerLandlordTitle")} description={t("ownerLandlordDescription")}>
      {meterReadings.length > 0 ? (
        <DataTable
          columns={[t("colApartment"), t("colValue"), t("colSubmitted"), t("colTrend")]}
          rows={meterReadings.map((item) => [
            item.apartment,
            item.value,
            item.submittedAt,
            <span
              key={`${item.id}-trend`}
              className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700"
            >
              {item.trend} m³
            </span>,
          ])}
          pageSize={10}
        />
      ) : (
        <p className="text-sm text-gray-500">No meter readings available</p>
      )}
    </SectionCard>
  );
}
