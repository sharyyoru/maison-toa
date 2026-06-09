import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { autofillGroupRefs, type AutofillSummary } from "@/lib/groupRefAutofill";

export const runtime = "nodejs";

type AutofillReport = {
  filled: number;
  kept: number;
  standalone: number;
  needsManual: number;
  skipAcf: number;
  unknown: number;
  details: Array<{
    tardoc_code: string;
    sort_order: number;
    ref_code: string | null;
    filledBy: AutofillSummary["items"][number]["filledBy"];
    baseCode?: string;
  }>;
};

function summaryToReport(s: AutofillSummary): AutofillReport {
  return {
    filled: s.filled,
    kept: s.kept,
    standalone: s.standalone,
    needsManual: s.needsManual,
    skipAcf: s.skipAcf,
    unknown: s.unknown,
    details: s.items.map((it) => ({
      tardoc_code: it.tardoc_code,
      sort_order: it.sort_order,
      ref_code: it.ref_code,
      filledBy: it.filledBy,
      baseCode: it.baseCode,
    })),
  };
}

/**
 * GET /api/tardoc/groups — List all active TarDoc groups with their items
 */
export async function GET() {
  try {
    const { data: groups, error } = await supabaseAdmin
      .from("tardoc_groups")
      .select(`
        id, name, description, canton, law_type, tax_point_value,
        created_by_name, is_active,
        validation_status, validation_message, last_validated_at,
        created_at, updated_at,
        tardoc_group_items (
          id, tardoc_code, description, quantity, ref_code,
          side_type, tp_mt, tp_tt,
          internal_factor_mt, internal_factor_tt,
          external_factor_mt, external_factor_tt,
          sort_order, tariff_type, unit_price, service_id
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
      canton = "VD",
      law_type = "KVG",
      tax_point_value = null,
      created_by_name,
      items = [],
    } = body as {
      name: string;
      description?: string;
      canton?: string;
      law_type?: string;
      tax_point_value?: number | null;
      created_by_name?: string;
      items?: Array<{
        tardoc_code: string;
        description?: string;
        quantity?: number;
        ref_code?: string | null;
        side_type?: number;
        tp_mt?: number;
        tp_tt?: number;
        internal_factor_mt?: number;
        internal_factor_tt?: number;
        external_factor_mt?: number;
        external_factor_tt?: number;
        sort_order?: number;
        tariff_type?: string;
        unit_price?: number | null;
        service_id?: string | null;
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
        tax_point_value: tax_point_value ?? null,
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

    // Run catalog-driven autofill (only fills empty ref_codes, never overwrites)
    // Skip material items (tariff_type=402 or mat: prefix) — they have no ref codes
    let autofillReport: AutofillReport | null = null;
    let resolvedItems = items;
    const autofillableItems = items.filter((i) => (i.tariff_type ?? "007") !== "402" && !i.tardoc_code.startsWith("mat:"));
    if (autofillableItems.length > 0) {
      try {
        const summary = await autofillGroupRefs(
          autofillableItems.map((item, idx) => ({
            tardoc_code: item.tardoc_code,
            ref_code: item.ref_code ?? null,
            sort_order: item.sort_order ?? idx,
          })),
        );
        autofillReport = summaryToReport(summary);
        const refByOrder = new Map(summary.items.map((r) => [r.sort_order, r.ref_code]));
        resolvedItems = items.map((item, idx) => ({
          ...item,
          ref_code: refByOrder.get(item.sort_order ?? idx) ?? item.ref_code ?? null,
        }));
      } catch (err) {
        console.error("[POST /api/tardoc/groups] autofill failed (continuing):", err);
      }
    }

    // Insert items
    if (resolvedItems.length > 0) {
      const itemRows = resolvedItems.map((item, idx) => ({
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
        tariff_type: item.tariff_type ?? "007",
        unit_price: item.unit_price ?? null,
        service_id: item.service_id ?? null,
      }));

      const { error: itemsError } = await supabaseAdmin
        .from("tardoc_group_items")
        .insert(itemRows);

      if (itemsError) {
        console.error("Failed to insert group items:", itemsError);
      }
    }

    return NextResponse.json({ success: true, id: group.id, autofill: autofillReport });
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
    const { id, name, description, canton, law_type, tax_point_value, items } = body as {
      id: string;
      name?: string;
      description?: string;
      canton?: string;
      law_type?: string;
      tax_point_value?: number | null;
      items?: Array<{
        tardoc_code: string;
        description?: string;
        quantity?: number;
        ref_code?: string | null;
        side_type?: number;
        tp_mt?: number;
        tp_tt?: number;
        internal_factor_mt?: number;
        internal_factor_tt?: number;
        external_factor_mt?: number;
        external_factor_tt?: number;
        sort_order?: number;
        tariff_type?: string;
        unit_price?: number | null;
        service_id?: string | null;
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
    if (tax_point_value !== undefined) updateData.tax_point_value = tax_point_value;

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
    let autofillReport: AutofillReport | null = null;
    if (items !== undefined) {
      // Run catalog-driven autofill (only fills empty ref_codes, never overwrites)
      // Skip material items (tariff_type=402 or mat: prefix)
      let resolvedItems = items;
      const autofillableItems = items.filter((i) => (i.tariff_type ?? "007") !== "402" && !i.tardoc_code.startsWith("mat:"));
      if (autofillableItems.length > 0) {
        try {
          const summary = await autofillGroupRefs(
            autofillableItems.map((item, idx) => ({
              tardoc_code: item.tardoc_code,
              ref_code: item.ref_code ?? null,
              sort_order: item.sort_order ?? idx,
            })),
          );
          autofillReport = summaryToReport(summary);
          const refByOrder = new Map(summary.items.map((r) => [r.sort_order, r.ref_code]));
          resolvedItems = items.map((item, idx) => ({
            ...item,
            ref_code: refByOrder.get(item.sort_order ?? idx) ?? item.ref_code ?? null,
          }));
        } catch (err) {
          console.error("[PUT /api/tardoc/groups] autofill failed (continuing):", err);
        }
      }

      // Delete old items and insert new ones
      await supabaseAdmin.from("tardoc_group_items").delete().eq("group_id", id);

      if (resolvedItems.length > 0) {
        const itemRows = resolvedItems.map((item, idx) => ({
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
          tariff_type: item.tariff_type ?? "007",
          unit_price: item.unit_price ?? null,
          service_id: item.service_id ?? null,
        }));

        const { error: itemsError } = await supabaseAdmin
          .from("tardoc_group_items")
          .insert(itemRows);

        if (itemsError) {
          console.error("Failed to insert group items:", itemsError);
        }
      }
    }

    return NextResponse.json({ success: true, autofill: autofillReport });
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
