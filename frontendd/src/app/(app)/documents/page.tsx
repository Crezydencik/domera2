import { getDocumentsPageData } from "@/shared/server/page-loaders/documents.loader";
import { requireManagementCompanyBuildings } from "@/shared/server/management-building-access";
import { DocumentsWorkspace } from "./documents-workspace";

function isAccountantRole(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[^a-z]/gi, "")
    .toLowerCase() === "accountant";
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ role?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const data = await getDocumentsPageData(params.role);
  requireManagementCompanyBuildings(data);

  return (
    <DocumentsWorkspace
      role={data.role}
      userId={data.userId}
      buildings={data.buildings}
      apartments={data.apartments}
      serverDocuments={data.documents}
      buildingDocumentsOnly={isAccountantRole(data.rawRole)}
    />
  );
}
