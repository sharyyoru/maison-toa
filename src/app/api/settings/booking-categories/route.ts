import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const BOOKING_NAME_TRANSLATIONS_KEY = "booking_name_translations";

async function getBookingNameTranslations() {
  const { data } = await supabaseAdmin
    .from("site_settings")
    .select("value")
    .eq("key", BOOKING_NAME_TRANSLATIONS_KEY)
    .single();

  return (data?.value ?? {}) as {
    categories?: Record<string, string>;
    categoryDescriptions?: Record<string, string>;
    treatments?: Record<string, string>;
    treatmentDescriptions?: Record<string, string>;
  };
}

export async function GET() {
  try {
    const [categoriesResult, translations] = await Promise.all([
      supabaseAdmin
        .from("booking_categories")
        .select("*")
        .order("order_index", { ascending: true }),
      getBookingNameTranslations(),
    ]);

    if (categoriesResult.error) {
      return NextResponse.json({ error: categoriesResult.error.message }, { status: 500 });
    }

    const categories = (categoriesResult.data || []).map((category: any) => ({
      ...category,
      name_en: translations.categories?.[category.id] || category.name_en || null,
      description_en: translations.categoryDescriptions?.[category.id] || category.description_en || null,
    }));

    return NextResponse.json({ categories });
  } catch (err) {
    console.error("GET booking-categories error:", err);
    return NextResponse.json({ error: "Failed to fetch booking categories" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { categories } = body;

    if (!Array.isArray(categories)) {
      return NextResponse.json({ error: "categories must be an array" }, { status: 400 });
    }

    // Get existing category IDs
    const { data: existing } = await supabaseAdmin
      .from("booking_categories")
      .select("id");

    const existingIds = new Set((existing || []).map((r: { id: string }) => r.id));
    const incomingIds = new Set(categories.map((c: { id: string }) => c.id));
    const currentTranslations = await getBookingNameTranslations();
    const categoryTranslations = Object.fromEntries(
      categories
        .filter((c: { id: string; name_en?: string | null }) => c.name_en?.trim())
        .map((c: { id: string; name_en?: string | null }) => [c.id, c.name_en!.trim()])
    );
    const categoryDescriptionTranslations = Object.fromEntries(
      categories
        .filter((c: { id: string; description_en?: string | null }) => c.description_en?.trim())
        .map((c: { id: string; description_en?: string | null }) => [c.id, c.description_en!.trim()])
    );

    // Delete removed categories
    const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
    if (toDelete.length > 0) {
      const { error: delError } = await supabaseAdmin
        .from("booking_categories")
        .delete()
        .in("id", toDelete);
      if (delError) {
        return NextResponse.json({ error: delError.message }, { status: 500 });
      }
    }

    // Upsert all incoming categories
    if (categories.length > 0) {
      const rows = categories.map((c: {
        id: string;
        name: string;
        description: string;
        patient_type: string;
        order_index: number;
        slug: string;
        enabled: boolean;
        skip_treatment?: boolean;
      }) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        patient_type: c.patient_type, // 'new' or 'existing'
        order_index: c.order_index,
        slug: c.slug,
        enabled: c.enabled !== undefined ? c.enabled : true,
        skip_treatment: c.skip_treatment !== undefined ? c.skip_treatment : false,
        updated_at: new Date().toISOString(),
      }));

      const { error: upsertError } = await supabaseAdmin
        .from("booking_categories")
        .upsert(rows, { onConflict: "id" });

      if (upsertError) {
        return NextResponse.json({ error: upsertError.message }, { status: 500 });
      }
    }

    const { error: translationsError } = await supabaseAdmin
      .from("site_settings")
      .upsert(
        {
          key: BOOKING_NAME_TRANSLATIONS_KEY,
          value: {
            ...currentTranslations,
            categories: categoryTranslations,
            categoryDescriptions: categoryDescriptionTranslations,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );

    if (translationsError) {
      return NextResponse.json({ error: translationsError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PUT booking-categories error:", err);
    return NextResponse.json({ error: "Failed to save booking categories" }, { status: 500 });
  }
}
