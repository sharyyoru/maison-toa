import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomBytes } from "crypto";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://maison-toa-dk99.vercel.app";

function generateShortCode(): string {
  return randomBytes(4).toString("hex"); // 8 characters
}

function buildLongUrl(
  patientType: "new" | "existing",
  categorySlug?: string | null,
  treatmentId?: string | null,
  doctorSlug?: string | null
): string {
  let path = patientType === "new" ? "/book-appointment/new-patient" : "/book-appointment/existing-patient";
  if (categorySlug) {
    path += `/${categorySlug}`;
    if (treatmentId) {
      path += `/${treatmentId}`;
      if (doctorSlug) {
        path += `/${doctorSlug}`;
      }
    }
  }
  return `${APP_URL}${path}`;
}

async function buildLinkRow(body: any, existingShortCode?: string) {
  const { patient_type, category_id, treatment_id, doctor_id, name, group_name } = body;

  if (!patient_type || !["new", "existing"].includes(patient_type)) {
    return { error: "Missing or invalid patient_type", status: 400 };
  }
  if (!name || typeof name !== "string") {
    return { error: "Missing name", status: 400 };
  }

  let categorySlug: string | null = null;
  let doctorSlug: string | null = null;
  const treatmentIdToUse: string | null = treatment_id || null;

  if (category_id) {
    const { data: category } = await supabaseAdmin
      .from("booking_categories")
      .select("slug")
      .eq("id", category_id)
      .single();
    if (!category?.slug) {
      return { error: "Category not found", status: 400 };
    }
    categorySlug = category.slug;
  }

  if (doctor_id) {
    const { data: doctor } = await supabaseAdmin
      .from("booking_doctors")
      .select("slug")
      .eq("id", doctor_id)
      .single();
    if (!doctor?.slug) {
      return { error: "Doctor not found", status: 400 };
    }
    doctorSlug = doctor.slug;
  }

  const longUrl = buildLongUrl(patient_type, categorySlug, treatmentIdToUse, doctorSlug);

  // Generate a unique short code
  let shortCode = existingShortCode;
  if (!shortCode) {
    let attempts = 0;
    while (attempts < 10) {
      const candidate = generateShortCode();
      const { data: existing } = await supabaseAdmin
        .from("booking_links")
        .select("id")
        .eq("short_code", candidate)
        .maybeSingle();
      if (!existing) {
        shortCode = candidate;
        break;
      }
      attempts++;
    }
    if (!shortCode) {
      return { error: "Failed to generate unique short code", status: 500 };
    }
  }

  return {
    row: {
      name: name.trim(),
      patient_type,
      category_id: category_id || null,
      treatment_id: treatment_id || null,
      doctor_id: doctor_id || null,
      category_slug: categorySlug,
      doctor_slug: doctorSlug,
      long_url: longUrl,
      short_code: shortCode,
      group_name: group_name?.trim() || null,
    },
  };
}

// GET /api/settings/booking-links
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("booking_links")
      .select("*, booking_categories(name), booking_treatments(name), booking_doctors(name)")
      .order("group_name", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ links: data || [] });
  } catch (err: any) {
    console.error("GET booking-links error:", err);
    return NextResponse.json({ error: "Failed to fetch booking links" }, { status: 500 });
  }
}

// POST /api/settings/booking-links
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await buildLinkRow(body);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const { data, error } = await supabaseAdmin
      .from("booking_links")
      .insert(result.row)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ link: data });
  } catch (err: any) {
    console.error("POST booking-link error:", err);
    return NextResponse.json({ error: "Failed to create booking link" }, { status: 500 });
  }
}

// DELETE /api/settings/booking-links?id=xxx
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("booking_links").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("DELETE booking-link error:", err);
    return NextResponse.json({ error: "Failed to delete booking link" }, { status: 500 });
  }
}
