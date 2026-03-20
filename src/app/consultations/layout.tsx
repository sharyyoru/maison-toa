import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Consultation Form | Maison Toa",
  description: "Patient consultation form for Maison Toa",
};

export default function ConsultationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // This layout bypasses the main app layout's sidebar/header
  // by rendering children directly without the shell components
  return <>{children}</>;
}
