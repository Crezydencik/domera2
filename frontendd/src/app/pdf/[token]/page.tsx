import type { Metadata } from "next";
import { InvoicePublicViewer } from "../../invoices/public/[token]/invoice-public-viewer";

export const metadata: Metadata = {
  title: "Invoice - Domera",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function PublicPdfPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return <InvoicePublicViewer token={token} />;
}
