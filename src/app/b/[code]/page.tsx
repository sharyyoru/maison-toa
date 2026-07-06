import { notFound, redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function BookingLinkRedirectPage({ params }: PageProps) {
  const { code } = await params;

  const { data: link } = await supabaseAdmin
    .from("booking_links")
    .select("long_url")
    .eq("short_code", code)
    .single();

  if (!link?.long_url) {
    notFound();
  }

  redirect(link.long_url);
}
