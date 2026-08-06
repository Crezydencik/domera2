import { ResidentDashboard } from "./resident-dashboard";
import type { RoleDataBundle } from "@/shared/server/auth-context";

export function LandlordDashboard({ data }: { data: RoleDataBundle }) {
  return <ResidentDashboard data={data} />;
}
