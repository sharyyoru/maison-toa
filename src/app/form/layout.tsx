import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Patient Form - Aesthetics Clinic",
  description: "Complete your patient form",
};

export default function FormLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      {children}
    </div>
  );
}
