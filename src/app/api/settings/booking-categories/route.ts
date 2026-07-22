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

    const configuredProviderIds = [...new Set(
      categories
        .map((category: { secondary_calendar_provider_id?: string | null }) => category.secondary_calendar_provider_id)
        .filter((id: string | null | undefined): id is string => Boolean(id)),
    )];
    if (configuredProviderIds.length > 0) {
      const { data: providers } = await supabaseAdmin
        .from("providers")
        .select("id")
        .in("id", configuredProviderIds)
        .in("role", ["doctor", "nurse", "technician"]);
      if (providers?.length !== configuredProviderIds.length) {
        return NextResponse.json({ error: "One or more secondary calendars are invalid." }, { status: 400 });
      }
    }

    const invalidRule = categories.some((category: {
      secondary_calendar_provider_id?: string | null;
      secondary_calendar_duration_minutes?: number | null;
      secondary_calendar_position?: string | null;
    }) => {
      const providerId = category.secondary_calendar_provider_id || null;
      const duration = Number(category.secondary_calendar_duration_minutes);
      const position = category.secondary_calendar_position || "start";
      return providerId
        ? !Number.isInteger(duration) || duration < 1 || duration > 480 || !["start", "end"].includes(position)
        : Boolean(category.secondary_calendar_duration_minutes);
    });
    if (invalidRule) {
      return NextResponse.json({ error: "Secondary calendar duration must be a whole number from 1 to 480." }, { status: 400 });
    }

    const invalidBookingDuration = categories.some((category: { booking_duration_minutes?: number | null }) => {
      const duration = Number(category.booking_duration_minutes ?? 60);
      return !Number.isInteger(duration) || duration < 1 || duration > 480;
    });
    if (invalidBookingDuration) {
      return NextResponse.json({ error: "Booking duration must be a whole number from 1 to 480." }, { status: 400 });
    }

    const endCategories = categories.filter((category: any) =>
      category.secondary_calendar_provider_id && (category.secondary_calendar_position || "start") === "end"
    );
    if (endCategories.length > 0) {
      const { data: inheritingTreatments, error: treatmentError } = await supabaseAdmin
        .from("booking_treatments")
        .select("category_id, duration_minutes, secondary_calendar_mode")
        .in("category_id", endCategories.map((category: any) => category.id));
      if (treatmentError) {
        return NextResponse.json({ error: treatmentError.message }, { status: 500 });
      }
      const invalidEndCategory = endCategories.some((category: any) => {
        const reservationDuration = Number(category.secondary_calendar_duration_minutes);
        const requiredDurations = [
          ...(category.skip_treatment ? [Number(category.booking_duration_minutes ?? 60)] : []),
          ...(inheritingTreatments || [])
          .filter((treatment: any) => treatment.category_id === category.id && treatment.secondary_calendar_mode !== "custom" && treatment.secondary_calendar_mode !== "disabled")
          .map((treatment: any) => Number(treatment.duration_minutes)),
        ];
        return requiredDurations.some((duration) => reservationDuration < duration);
      });
      if (invalidEndCategory) {
        return NextResponse.json({ error: "An end-positioned reservation must be at least as long as every inherited doctor treatment." }, { status: 400 });
      }
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
        booking_duration_minutes?: number | null;
        secondary_calendar_provider_id?: string | null;
        secondary_calendar_duration_minutes?: number | null;
        secondary_calendar_position?: string | null;
      }) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        patient_type: c.patient_type, // 'new' or 'existing'
        order_index: c.order_index,
        slug: c.slug,
        enabled: c.enabled !== undefined ? c.enabled : true,
        skip_treatment: c.skip_treatment !== undefined ? c.skip_treatment : false,
        booking_duration_minutes: Number(c.booking_duration_minutes ?? 60),
        secondary_calendar_provider_id: c.secondary_calendar_provider_id || null,
        secondary_calendar_duration_minutes: c.secondary_calendar_provider_id
          ? Number(c.secondary_calendar_duration_minutes)
          : null,
        secondary_calendar_position: c.secondary_calendar_position || "start",
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
