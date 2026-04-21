import { LogoutButton } from "@/components/logout-button";
import { SectionCard } from "@/components/section-card";
import { getRoleDataBundle } from "@/shared/lib/domera-api.server";

const roleLabel = {
  managementCompany: "Management company",
  resident: "Resident",
  landlord: "Landlord",
} as const;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ role?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const data = await getRoleDataBundle(params.role);

  const settingsGroups = [
    {
      title: "Workspace preferences",
      items: [
        `Default role view: ${roleLabel[data.role]}`,
        `Visible notifications: ${data.notifications.length}`,
        `Documents in archive: ${data.documents.length}`,
      ],
    },
    {
      title: "Portfolio scope",
      items: [
        `Buildings: ${data.buildings.length}`,
        `Apartments: ${data.apartments.length}`,
        `Invoices: ${data.invoices.length}`,
      ],
    },
    {
      title: "Security",
      items: [
        `Company: ${data.companyId ?? "Not linked"}`,
        `Apartment: ${data.apartmentId ?? "Not linked"}`,
        "Session cookies are active for role-based access",
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <SectionCard title="Settings" description="Adjust workspace behavior for each user role.">
        <div className="grid gap-3 md:grid-cols-3">
          {settingsGroups.map((group) => (
            <div key={group.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="font-medium text-slate-900">{group.title}</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {group.items.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Session" description="Manage the active session and current role preview.">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-900">Active role: {roleLabel[data.role]}</p>
            <p className="mt-1 text-sm text-slate-500">
              Use the sidebar role preview to switch workspace context instantly.
            </p>
          </div>
          <LogoutButton />
        </div>
      </SectionCard>
    </div>
  );
}
