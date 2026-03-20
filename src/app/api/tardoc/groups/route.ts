import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * GET /api/tardoc/groups — List all active TarDoc groups with their items
 */
export async function GET() {
  try {
    const { data: groups, error } = await supabaseAdmin
      .from("tardoc_groups")
      .select(`
        id, name, description, canton, law_type,
        created_by_name, is_active,
        validation_status, validation_message, last_validated_at,
        created_at, updated_at,
        tardoc_group_items (
          id, tardoc_code, description, quantity, ref_code,
          side_type, tp_mt, tp_tt,
          internal_factor_mt, internal_factor_tt,
          external_factor_mt, external_factor_tt,
          sort_order
        )
      `)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Sort items within each group
    const sorted = (groups || []).map((g: any) => ({
      ...g,
      tardoc_group_items: (g.tardoc_group_items || []).sort(
        (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
      ),
    }));

    return NextResponse.json({ success: true, data: sorted });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/tardoc/groups — Create a new TarDoc group with items
 *
 * Body: { name, description?, canton?, law_type?, items: [...] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      description,
      canton = "GE",
      law_type = "KVG",
      created_by_name,
      items = [],
    } = body as {
      name: string;
      description?: string;
      canton?: string;
      law_type?: string;
      created_by_name?: string;
      items?: Array<{
        tardoc_code: string;
        description?: string;
        quantity?: number;
        ref_code?: string;
        side_type?: number;
        tp_mt?: number;
        tp_tt?: number;
        internal_factor_mt?: number;
        internal_factor_tt?: number;
        external_factor_mt?: number;
        external_factor_tt?: number;
        sort_order?: number;
      }>;
    };

    if (!name?.trim()) {
      return NextResponse.json({ error: "Group name is required" }, { status: 400 });
    }

    // Create group
    const { data: group, error: groupError } = await supabaseAdmin
      .from("tardoc_groups")
      .insert({
        name: name.trim(),
        description: description?.trim() || null,
        canton,
        law_type,
        created_by_name: created_by_name || null,
        validation_status: "pending",
      })
      .select("id")
      .single();

    if (groupError || !group) {
      return NextResponse.json(
        { error: groupError?.message || "Failed to create group" },
        { status: 500 },
      );
    }

    // Insert items
    if (items.length > 0) {
      const itemRows = items.map((item, idx) => ({
        group_id: group.id,
        tardoc_code: item.tardoc_code,
        description: item.description || null,
        quantity: item.quantity ?? 1,
        ref_code: item.ref_code || null,
        side_type: item.side_type ?? 0,
        tp_mt: item.tp_mt ?? 0,
        tp_tt: item.tp_tt ?? 0,
        internal_factor_mt: item.internal_factor_mt ?? 1,
        internal_factor_tt: item.internal_factor_tt ?? 1,
        external_factor_mt: item.external_factor_mt ?? 1,
        external_factor_tt: item.external_factor_tt ?? 1,
        sort_order: item.sort_order ?? idx,
      }));

      const { error: itemsError } = await supabaseAdmin
        .from("tardoc_group_items")
        .insert(itemRows);

      if (itemsError) {
        console.error("Failed to insert group items:", itemsError);
      }
    }

    return NextResponse.json({ success: true, id: group.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/tardoc/groups — Update an existing TarDoc group
 *
 * Body: { id, name?, description?, canton?, law_type?, items?: [...] }
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, description, canton, law_type, items } = body as {
      id: string;
      name?: string;
      description?: string;
      canton?: string;
      law_type?: string;
      items?: Array<{
        tardoc_code: string;
        description?: string;
        quantity?: number;
        ref_code?: string;
        side_type?: number;
        tp_mt?: number;
        tp_tt?: number;
        internal_factor_mt?: number;
        internal_factor_tt?: number;
        external_factor_mt?: number;
        external_factor_tt?: number;
        sort_order?: number;
      }>;
    };

    if (!id) {
      return NextResponse.json({ error: "Group id is required" }, { status: 400 });
    }

    // Update group fields
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (canton !== undefined) updateData.canton = canton;
    if (law_type !== undefined) updateData.law_type = law_type;

    // Reset validation when items change
    if (items !== undefined) {
      updateData.validation_status = "pending";
      updateData.validation_message = null;
      updateData.last_validated_at = null;
    }

    const { error: updateError } = await supabaseAdmin
      .from("tardoc_groups")
      .update(updateData)
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Replace items if provided
    if (items !== undefined) {
      // Delete old items
      await supabaseAdmin.from("tardoc_group_items").delete().eq("group_id", id);

      // Insert new items
      if (items.length > 0) {
        const itemRows = items.map((item, idx) => ({
          group_id: id,
          tardoc_code: item.tardoc_code,
          description: item.description || null,
          quantity: item.quantity ?? 1,
          ref_code: item.ref_code || null,
          side_type: item.side_type ?? 0,
          tp_mt: item.tp_mt ?? 0,
          tp_tt: item.tp_tt ?? 0,
          internal_factor_mt: item.internal_factor_mt ?? 1,
          internal_factor_tt: item.internal_factor_tt ?? 1,
          external_factor_mt: item.external_factor_mt ?? 1,
          external_factor_tt: item.external_factor_tt ?? 1,
          sort_order: item.sort_order ?? idx,
        }));

        const { error: itemsError } = await supabaseAdmin
          .from("tardoc_group_items")
          .insert(itemRows);

        if (itemsError) {
          console.error("Failed to insert group items:", itemsError);
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
 * DELETE /api/tardoc/groups — Soft-delete a TarDoc group
 *
 * Body: { id }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body as { id: string };

    if (!id) {
      return NextResponse.json({ error: "Group id is required" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("tardoc_groups")
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
