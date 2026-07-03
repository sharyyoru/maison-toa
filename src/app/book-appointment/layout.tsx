import type { Metadata } from "next";
import { GoogleTagManager, GoogleTagManagerNoScript, TrackingParamsCapture } from "@/components/GoogleTagManager";
import { LanguageProvider } from "@/contexts/LanguageContext";

export const metadata: Metadata = {
  title: "Book Appointment | Maison Tóā",
  description: "Book your appointment at Maison Tóā",
};

export default function BookingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // This layout bypasses the main app layout's sidebar/header
  // by rendering children directly without the shell components
  return (
    <LanguageProvider>
      <GoogleTagManager />
      <GoogleTagManagerNoScript />
      <TrackingParamsCapture />
      {children}
    </LanguageProvider>
  );
}
