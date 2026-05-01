"use client";
import dynamic from "next/dynamic";
import { useAuthSession } from "@/shared/hooks/use-auth";

const ManagementCompanyPage = dynamic(() => import("./management-company/page"), { ssr: false });
const OwnerLandlordPage = dynamic(() => import("./owner-landlord/page"), { ssr: false });

export default function MeterReadingsPage() {
  const session = useAuthSession();
  const isResident = session.dashboardRole === "resident" || session.dashboardRole === "landlord";
  return isResident ? <OwnerLandlordPage /> : <ManagementCompanyPage />;
}