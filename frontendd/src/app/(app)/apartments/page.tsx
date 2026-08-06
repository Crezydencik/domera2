import { getApartmentsPageData } from "@/shared/server/page-loaders/apartments.loader";
import { ApartmentsManagementView } from "./_management-view";
import { ApartmentsResidentView } from "./_resident-view";

export default async function ApartmentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ role?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const data = await getApartmentsPageData(params.role);

  if (data.role === "managementCompany") {
    return <ApartmentsManagementView data={data} />;
  }

  return <ApartmentsResidentView data={data} />;
}
