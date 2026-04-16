import type { Metadata } from "next";
import { LanguageProvider } from "@/contexts/LanguageContext";

export const metadata: Metadata = {
  title: "Manage Appointment | Maison Tóā",
  description: "Reschedule or cancel your appointment at Maison Tóā",
};

export default function ManageLayout({ children }: { children: React.ReactNode }) {
  return <LanguageProvider>{children}</LanguageProvider>;
}
