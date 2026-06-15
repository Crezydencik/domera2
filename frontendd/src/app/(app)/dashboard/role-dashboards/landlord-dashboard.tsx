import { ResidentDashboard } from "./resident-dashboard";
import type { RoleDataBundle } from "@/shared/lib/domera-api.server";

export function LandlordDashboard({ data }: { data: RoleDataBundle }) {
  return <ResidentDashboard data={data} />;
}
