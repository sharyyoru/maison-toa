import type { Metadata } from "next";
import { GoogleTagManager, GoogleTagManagerNoScript } from "@/components/GoogleTagManager";

export const metadata: Metadata = {
  title: "Chat with Aliice | Maison Toa",
  description: "Chat with our AI assistant Aliice",
};

export default function EmbedChatLayout({
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
