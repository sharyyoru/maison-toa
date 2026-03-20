import type { Metadata } from "next";
import { GoogleTagManager, GoogleTagManagerNoScript } from "@/components/GoogleTagManager";

export const metadata: Metadata = {
  title: "Book Appointment | Aesthetics Clinic",
  description: "Book your appointment at Aesthetics Clinic Geneva",
};

export default function BookingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // This layout bypasses the main app layout's sidebar/header
  // by rendering children directly without the shell components
  return (
    <>
      <GoogleTagManager />
      <GoogleTagManagerNoScript />
      {children}
    </>
  );
}
