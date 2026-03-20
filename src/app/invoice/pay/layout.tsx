import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Invoice Payment | Aesthetics Clinic",
  description: "Pay your invoice securely",
};

export default function InvoicePaymentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // This layout bypasses the main app layout's sidebar/header
  // by rendering children directly without the shell components
  return <>{children}</>;
}
