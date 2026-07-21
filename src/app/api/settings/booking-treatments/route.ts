import { NextResponse } from "next/server";
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("category_id");

    let query = supabaseAdmin
      .from("booking_treatments")
      .select("*")
      .order("order_index", { ascending: true });

    if (categoryId) {
      query = query.eq("category_id", categoryId);
    }

    const [treatmentsResult, translations] = await Promise.all([
      query,
      getBookingNameTranslations(),
    ]);

    if (treatmentsResult.error) {
      console.error("Error fetching treatments:", treatmentsResult.error);
      return NextResponse.json(
        { error: "Failed to fetch treatments" },
        { status: 500 }
      );
    }

    const treatments = (treatmentsResult.data || []).map((treatment: any) => ({
      ...treatment,
      name_en: translations.treatments?.[treatment.id] || treatment.name_en || null,
      description_en: translations.treatmentDescriptions?.[treatment.id] || treatment.description_en || null,
    }));

    return NextResponse.json({ treatments });
  } catch (error) {
    console.error("Error in GET /api/settings/booking-treatments:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { treatments } = body;

    if (!Array.isArray(treatments)) {
      return NextResponse.json(
        { error: "Invalid treatments data" },
        { status: 400 }
      );
    }

    const configuredProviderIds = [...new Set(
      treatments
        .filter((t: { secondary_calendar_mode?: string }) => t.secondary_calendar_mode === "custom")
        .map((t: { secondary_calendar_provider_id?: string | null }) => t.secondary_calendar_provider_id)
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

    const invalidRule = treatments.some((t: {
      secondary_calendar_mode?: string;
      secondary_calendar_provider_id?: string | null;
      secondary_calendar_duration_minutes?: number | null;
    }) => {
      const mode = t.secondary_calendar_mode || "inherit";
      if (!["inherit", "disabled", "custom"].includes(mode)) return true;
      if (mode !== "custom") return false;
      const duration = Number(t.secondary_calendar_duration_minutes);
      return !t.secondary_calendar_provider_id || !Number.isInteger(duration) || duration < 1 || duration > 480;
    });
    if (invalidRule) {
      return NextResponse.json({ error: "Custom secondary calendar rules require a calendar and 1-480 whole minutes." }, { status: 400 });
    }

    const invalidDisplayDuration = treatments.some((t: { display_duration_minutes?: number | string | null }) => {
      if (t.display_duration_minutes == null || t.display_duration_minutes === "") return false;
      const duration = Number(t.display_duration_minutes);
      return !Number.isInteger(duration) || duration < 1 || duration > 480;
    });
    if (invalidDisplayDuration) {
      return NextResponse.json({ error: "Display duration must be empty or 1-480 whole minutes." }, { status: 400 });
    }

    const invalidBuffer = treatments.some((t: any) =>
      [t.buffer_before_minutes ?? 0, t.buffer_after_minutes ?? 0].some((value) => {
        const minutes = Number(value);
        return !Number.isInteger(minutes) || minutes < 0 || minutes > 480;
      })
    );
    if (invalidBuffer) {
      return NextResponse.json({ error: "Hidden buffer times must be 0-480 whole minutes." }, { status: 400 });
    }

    // Get existing treatment IDs
    const { data: existingTreatments } = await supabaseAdmin
      .from("booking_treatments")
      .select("id");

    const existingIds = new Set(existingTreatments?.map((t) => t.id) || []);
    const newIds = new Set(treatments.map((t) => t.id));
    const currentTranslations = await getBookingNameTranslations();
    const treatmentTranslations = Object.fromEntries(
      treatments
        .filter((t: { id: string; name_en?: string | null }) => t.name_en?.trim())
        .map((t: { id: string; name_en?: string | null }) => [t.id, t.name_en!.trim()])
    );
    const treatmentDescriptionTranslations = Object.fromEntries(
      treatments
        .filter((t: { id: string; description_en?: string | null }) => t.description_en?.trim())
        .map((t: { id: string; description_en?: string | null }) => [t.id, t.description_en!.trim()])
    );

    // Delete treatments that are no longer in the list
    const toDelete = [...existingIds].filter((id) => !newIds.has(id));
    if (toDelete.length > 0) {
      await supabaseAdmin
        .from("booking_treatments")
        .delete()
        .in("id", toDelete);
    }

    // Upsert all treatments in one batch
    const { error: upsertError } = await supabaseAdmin
      .from("booking_treatments")
      .upsert(
        treatments.map((t: any) => ({
          id: t.id,
          category_id: t.category_id,
          name: t.name,
          description: t.description || null,
          duration_minutes: t.duration_minutes,
          display_duration_minutes:
            t.display_duration_minutes == null || t.display_duration_minutes === ""
              ? null
              : Number(t.display_duration_minutes),
          buffer_before_minutes: Number(t.buffer_before_minutes ?? 0),
          buffer_after_minutes: Number(t.buffer_after_minutes ?? 0),
          order_index: t.order_index,
          enabled: t.enabled,
          prepayment_required: t.prepayment_required ?? false,
          linked_service_id: t.linked_service_id || null,
          service_category_id: t.service_category_id || null,
          display_price: t.display_price ?? null,
          secondary_calendar_mode: t.secondary_calendar_mode || "inherit",
          secondary_calendar_provider_id:
            t.secondary_calendar_mode === "custom" ? t.secondary_calendar_provider_id || null : null,
          secondary_calendar_duration_minutes:
            t.secondary_calendar_mode === "custom" ? Number(t.secondary_calendar_duration_minutes) : null,
        }))
      );

    if (upsertError) {
      console.error("Error upserting treatments:", upsertError);
      return NextResponse.json({ error: "Failed to save treatments" }, { status: 500 });
    }

    const { error: translationsError } = await supabaseAdmin
      .from("site_settings")
      .upsert(
        {
          key: BOOKING_NAME_TRANSLATIONS_KEY,
          value: {
            ...currentTranslations,
            treatments: treatmentTranslations,
            treatmentDescriptions: treatmentDescriptionTranslations,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );

    if (translationsError) {
      console.error("Error saving treatment translations:", translationsError);
      return NextResponse.json({ error: "Failed to save treatment translations" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in PUT /api/settings/booking-treatments:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { category_id, name, description, duration_minutes, display_duration_minutes, buffer_before_minutes, buffer_after_minutes, order_index, enabled, service_category_id } = body;

    if (!category_id || !name) {
      return NextResponse.json(
        { error: "category_id and name are required" },
        { status: 400 }
      );
    }

    const { data: treatment, error } = await supabaseAdmin
      .from("booking_treatments")
      .insert({
        category_id,
        name,
        description: description || null,
        duration_minutes: duration_minutes || 30,
        display_duration_minutes: display_duration_minutes || null,
        buffer_before_minutes: Number(buffer_before_minutes ?? 0),
        buffer_after_minutes: Number(buffer_after_minutes ?? 0),
        order_index: order_index || 0,
        enabled: enabled ?? true,
        service_category_id: service_category_id || null,
        secondary_calendar_mode: "inherit",
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating treatment:", error);
      return NextResponse.json(
        { error: "Failed to create treatment" },
        { status: 500 }
      );
    }

    return NextResponse.json({ treatment });
  } catch (error) {
    console.error("Error in POST /api/settings/booking-treatments:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Treatment ID is required" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("booking_treatments")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting treatment:", error);
      return NextResponse.json(
        { error: "Failed to delete treatment" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/settings/booking-treatments:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
