import type { Metadata } from "next";
import { GoogleTagManager, GoogleTagManagerNoScript } from "@/components/GoogleTagManager";

export const metadata: Metadata = {
  title: "Book Appointment | Aesthetics Clinic",
  description: "Book your appointment at Aesthetics Clinic Geneva",
};

export default function EmbedBookLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <GoogleTagManager />
      <GoogleTagManagerNoScript />
      {children}
    </>
  );
}
