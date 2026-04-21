import { ManagementCompanyDashboard } from "./role-dashboards/management-company-dashboard";
import { ResidentDashboard } from "./role-dashboards/resident-dashboard";
import { LandlordDashboard } from "./role-dashboards/landlord-dashboard";
import type { RoleDataBundle } from "@/shared/lib/domera-api.server";

interface RoleDashboardProps {
  data: RoleDataBundle;
}

export function RoleDashboard({ data }: RoleDashboardProps) {
  if (data.role === "resident") {
    return <ResidentDashboard data={data} />;
  }

  if (data.role === "landlord") {
    return <LandlordDashboard data={data} />;
  }

  return <ManagementCompanyDashboard data={data} />;
}
