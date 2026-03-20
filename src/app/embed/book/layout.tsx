import type { Metadata } from "next";
import { GoogleTagManager, GoogleTagManagerNoScript } from "@/components/GoogleTagManager";

export const metadata: Metadata = {
  title: "Book Appointment | Maison Toa",
  description: "Book your appointment at Maison Toa",
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
