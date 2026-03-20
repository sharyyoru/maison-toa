import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * GET /api/medication-templates — List all active medication templates with their items
 * Optional query params: ?service_id=xxx to filter by linked service
 */
export async function GET(request: NextRequest) {
  try {
    const serviceId = request.nextUrl.searchParams.get("service_id");

    let query = supabaseAdmin
      .from("medication_templates")
      .select(`
        id, name, description, service_id, is_active,
        created_at, updated_at,
        medication_template_items (
          id, product_name, product_number, product_type,
          intake_kind, amount_morning, amount_noon, amount_evening, amount_night,
          quantity, intake_note, sort_order
        )
      `)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (serviceId) {
      query = query.eq("service_id", serviceId);
    }

    const { data: templates, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Sort items within each template
    const sorted = (templates || []).map((t: any) => ({
      ...t,
      medication_template_items: (t.medication_template_items || []).sort(
        (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
      ),
    }));

    // If requested, also fetch service names for display
    const serviceIds = sorted
      .map((t: any) => t.service_id)
      .filter((id: string | null) => id !== null);

    let serviceMap: Record<string, string> = {};
    if (serviceIds.length > 0) {
      const { data: services } = await supabaseAdmin
        .from("services")
        .select("id, name")
        .in("id", serviceIds);
      if (services) {
        serviceMap = Object.fromEntries(services.map((s: any) => [s.id, s.name]));
      }
    }

    const enriched = sorted.map((t: any) => ({
      ...t,
      service_name: t.service_id ? serviceMap[t.service_id] || null : null,
    }));

    return NextResponse.json({ success: true, data: enriched });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/medication-templates — Create a new medication template with items
 *
 * Body: { name, description?, service_id?, items: [...] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      description,
      service_id,
      items = [],
    } = body as {
      name: string;
      description?: string;
      service_id?: string | null;
      items?: Array<{
        product_name: string;
        product_number?: number | null;
        product_type?: string;
        intake_kind?: string;
        amount_morning?: string;
        amount_noon?: string;
        amount_evening?: string;
        amount_night?: string;
        quantity?: number;
        intake_note?: string;
        sort_order?: number;
      }>;
    };

    if (!name?.trim()) {
      return NextResponse.json({ error: "Template name is required" }, { status: 400 });
    }

    // Create template
    const { data: template, error: templateError } = await supabaseAdmin
      .from("medication_templates")
      .insert({
        name: name.trim(),
        description: description?.trim() || null,
        service_id: service_id || null,
      })
      .select("id")
      .single();

    if (templateError || !template) {
      return NextResponse.json(
        { error: templateError?.message || "Failed to create template" },
        { status: 500 },
      );
    }

    // Insert items
    if (items.length > 0) {
      const itemRows = items.map((item, idx) => ({
        template_id: template.id,
        product_name: item.product_name,
        product_number: item.product_number ?? null,
        product_type: item.product_type || "MEDICATION",
        intake_kind: item.intake_kind || "FIXED",
        amount_morning: item.amount_morning || null,
        amount_noon: item.amount_noon || null,
        amount_evening: item.amount_evening || null,
        amount_night: item.amount_night || null,
        quantity: item.quantity ?? 1,
        intake_note: item.intake_note || null,
        sort_order: item.sort_order ?? idx,
      }));

      const { error: itemsError } = await supabaseAdmin
        .from("medication_template_items")
        .insert(itemRows);

      if (itemsError) {
        console.error("Failed to insert template items:", itemsError);
      }
    }

    return NextResponse.json({ success: true, id: template.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/medication-templates — Update an existing medication template
 *
 * Body: { id, name?, description?, service_id?, items?: [...] }
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, description, service_id, items } = body as {
      id: string;
      name?: string;
      description?: string;
      service_id?: string | null;
      items?: Array<{
        product_name: string;
        product_number?: number | null;
        product_type?: string;
        intake_kind?: string;
        amount_morning?: string;
        amount_noon?: string;
        amount_evening?: string;
        amount_night?: string;
        quantity?: number;
        intake_note?: string;
        sort_order?: number;
      }>;
    };

    if (!id) {
      return NextResponse.json({ error: "Template id is required" }, { status: 400 });
    }

    // Update template fields
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (service_id !== undefined) updateData.service_id = service_id || null;

    const { error: updateError } = await supabaseAdmin
      .from("medication_templates")
      .update(updateData)
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Replace items if provided
    if (items !== undefined) {
      // Delete old items
      await supabaseAdmin.from("medication_template_items").delete().eq("template_id", id);

      // Insert new items
      if (items.length > 0) {
        const itemRows = items.map((item, idx) => ({
          template_id: id,
          product_name: item.product_name,
          product_number: item.product_number ?? null,
          product_type: item.product_type || "MEDICATION",
          intake_kind: item.intake_kind || "FIXED",
          amount_morning: item.amount_morning || null,
          amount_noon: item.amount_noon || null,
          amount_evening: item.amount_evening || null,
          amount_night: item.amount_night || null,
          quantity: item.quantity ?? 1,
          intake_note: item.intake_note || null,
          sort_order: item.sort_order ?? idx,
        }));

        const { error: itemsError } = await supabaseAdmin
          .from("medication_template_items")
          .insert(itemRows);

        if (itemsError) {
          console.error("Failed to insert template items:", itemsError);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/medication-templates — Soft-delete a medication template
 *
 * Body: { id }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body as { id: string };

    if (!id) {
      return NextResponse.json({ error: "Template id is required" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("medication_templates")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
