import { getTranslations } from "next-intl/server";
import { DataTable } from "@/components/data-table";
import { SectionCard } from "@/components/section-card";
import { getRoleDataBundle } from "@/shared/lib/domera-api.server";

const statusMap: Record<string, string> = { Paid: "paid", Overdue: "overdue", Pending: "pending" };

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams?: Promise<{ role?: string }>;
}) {
  const t = await getTranslations("invoices");
  const params = (await searchParams) ?? {};
  const data = await getRoleDataBundle(params.role);

  return (
    <div className="space-y-6">
      <SectionCard title={t("title")} description={t("description")}>
        <DataTable
          columns={[t("colInvoice"), t("colApartment"), t("colResident"), t("colAmount"), t("colStatus")]}
          rows={data.invoices.map((item) => [
            <div key={`${item.id}-invoice`}>
              <p className="font-medium text-slate-900">{item.id}</p>
              <p className="text-xs text-slate-500">{t("due", { date: item.dueDate })}</p>
            </div>,
            item.apartment,
            item.resident,
            item.amount,
            <span
              key={`${item.id}-status`}
              className={`rounded-full px-2 py-1 text-xs font-medium ${
                item.status === "Paid"
                  ? "bg-emerald-50 text-emerald-700"
                  : item.status === "Overdue"
                    ? "bg-rose-50 text-rose-700"
                    : "bg-amber-50 text-amber-700"
              }`}
            >
              {t(statusMap[item.status] ?? "pending")}
            </span>,
          ])}
        />
      </SectionCard>
    </div>
  );
}
