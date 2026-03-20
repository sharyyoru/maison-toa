import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Consultation Form | Aesthetics Clinic",
  description: "Patient consultation form for Aesthetics Clinic Geneva",
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
