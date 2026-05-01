"use client";

import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table";
import { useTranslations } from "next-intl";
import { getApartmentAuditLogs } from "@/shared/api/apartments";

interface AuditLog {
  id: string;
  action: string;
  status: string;
  actorRole?: string;
  actorUid?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

interface AuditLogsBlockProps {
  apartmentId: string;
}

export function AuditLogsBlock({ apartmentId }: AuditLogsBlockProps) {
  const t = useTranslations("apartments");
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setLoading(true);
        const response = await getApartmentAuditLogs(apartmentId, 100);
        if (response.items) {
          setLogs(
            response.items.map((item: Record<string, unknown>) => ({
              id: typeof item.id === "string" ? item.id : "",
              action: typeof item.action === "string" ? item.action : "—",
              status: typeof item.status === "string" ? item.status : "—",
              actorRole: typeof item.actorRole === "string" ? item.actorRole : "—",
              metadata: typeof item.metadata === "object" && item.metadata !== null ? (item.metadata as Record<string, unknown>) : undefined,
              createdAt:
                typeof item.createdAt === "string"
                  ? new Date(item.createdAt).toLocaleString("lv-LV")
                  : "—",
            })),
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch audit logs");
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [apartmentId]);

  if (loading) {
    return <div className="text-sm text-slate-500">Загружаем историю действий...</div>;
  }

  if (error) {
    return <div className="text-sm text-red-600">Ошибка: {error}</div>;
  }

  if (logs.length === 0) {
    return <div className="text-sm text-slate-500">История действий пуста</div>;
  }

  return (
    <DataTable
      columns={["Действие", "Статус", "Роль", "Время"]}
      rows={logs.map((log) => [
        log.action,
        <span
          key={`status-${log.id}`}
          className={
            log.status === "success"
              ? "text-emerald-600"
              : log.status === "denied"
                ? "text-red-600"
                : log.status === "error"
                  ? "text-red-600"
                  : "text-amber-600"
          }
        >
          {log.status}
        </span>,
        log.actorRole,
        log.createdAt,
      ])}
    />
  );
}
