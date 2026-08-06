import { ManagementCompanyDashboard } from "./role-dashboards/management-company-dashboard";
import { ResidentDashboard } from "./role-dashboards/resident-dashboard";
import { LandlordDashboard } from "./role-dashboards/landlord-dashboard";
import { PlatformAdminDashboard } from "./role-dashboards/platform-admin-dashboard";
import type { RoleDataBundle } from "@/shared/server/auth-context";

interface RoleDashboardProps {
  data: RoleDataBundle;
  selectedBuildingId?: string;
}

export function RoleDashboard({ data, selectedBuildingId }: RoleDashboardProps) {
  if (data.role === "platformAdmin") {
    return <PlatformAdminDashboard data={data} />;
  }

  if (data.role === "resident") {
    return <ResidentDashboard data={data} />;
  }

  if (data.role === "landlord") {
    return <LandlordDashboard data={data} />;
  }

  return <ManagementCompanyDashboard data={data} selectedBuildingId={selectedBuildingId} />;
}
