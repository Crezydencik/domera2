import { getRoleDataBundle } from "@/shared/lib/domera-api.server";
import { DocumentsWorkspace } from "./documents-workspace";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ role?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const data = await getRoleDataBundle(params.role);

  return (
    <DocumentsWorkspace
      role={data.role}
      userId={data.userId}
      buildings={data.buildings}
      apartments={data.apartments}
      serverDocuments={data.documents}
    />
  );
}
