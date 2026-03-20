import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  validateServices,
  type ValidationServiceInput,
} from "@/lib/sumexTardoc";
import { CANTON_TAX_POINT_VALUES, type SwissCanton } from "@/lib/tardoc";

export const runtime = "nodejs";

/**
 * POST /api/tardoc/groups/validate
 *
 * Validates a TarDoc group's services using the Sumex IValidate interface.
 *
 * Body: { groupId } — validates an existing group from DB
 *   OR: { items, canton?, law_type? } — validates ad-hoc items
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { groupId, items: adHocItems, canton: adHocCanton, law_type: adHocLaw } = body as {
      groupId?: string;
      items?: Array<{
        tardoc_code: string;
        quantity?: number;
        ref_code?: string;
        side_type?: number;
        tp_mt?: number;
        tp_tt?: number;
        external_factor_mt?: number;
        external_factor_tt?: number;
      }>;
      canton?: string;
      law_type?: string;
    };

    let items: Array<{
      tardoc_code: string;
      quantity: number;
      ref_code?: string;
      side_type?: number;
      tp_mt: number;
      tp_tt: number;
      external_factor_mt: number;
      external_factor_tt: number;
    }>;
    let canton: string;
    let lawType: string;

    if (groupId) {
      // Load from DB
      const { data: group, error: groupError } = await supabaseAdmin
        .from("tardoc_groups")
        .select("canton, law_type")
        .eq("id", groupId)
        .single();

      if (groupError || !group) {
        return NextResponse.json({ error: "Group not found" }, { status: 404 });
      }

      const { data: dbItems, error: itemsError } = await supabaseAdmin
        .from("tardoc_group_items")
        .select("tardoc_code, quantity, ref_code, side_type, tp_mt, tp_tt, external_factor_mt, external_factor_tt")
        .eq("group_id", groupId)
        .order("sort_order", { ascending: true });

      if (itemsError || !dbItems || dbItems.length === 0) {
        return NextResponse.json({ error: "No items in group" }, { status: 400 });
      }

      items = dbItems.map((i: any) => ({
        tardoc_code: i.tardoc_code,
        quantity: i.quantity ?? 1,
        ref_code: i.ref_code || undefined,
        side_type: i.side_type ?? 0,
        tp_mt: i.tp_mt ?? 0,
        tp_tt: i.tp_tt ?? 0,
        external_factor_mt: i.external_factor_mt ?? 1,
        external_factor_tt: i.external_factor_tt ?? 1,
      }));
      canton = group.canton || "GE";
      lawType = group.law_type || "KVG";
    } else if (adHocItems && adHocItems.length > 0) {
      items = adHocItems.map((i) => ({
        tardoc_code: i.tardoc_code,
        quantity: i.quantity ?? 1,
        ref_code: i.ref_code || undefined,
        side_type: i.side_type ?? 0,
        tp_mt: i.tp_mt ?? 0,
        tp_tt: i.tp_tt ?? 0,
        external_factor_mt: i.external_factor_mt ?? 1,
        external_factor_tt: i.external_factor_tt ?? 1,
      }));
      canton = adHocCanton || "GE";
      lawType = adHocLaw || "KVG";
    } else {
      return NextResponse.json({ error: "Provide groupId or items" }, { status: 400 });
    }

    // Map law type string to enum
    const lawMap: Record<string, number> = {
      KVG: 1, UVG: 2, IVG: 3, MVG: 4, VVG: 5,
    };
    const lawEnum = lawMap[lawType.toUpperCase()] ?? 1;

    // Get tax point value for canton
    const tpv = CANTON_TAX_POINT_VALUES[(canton as SwissCanton)] ?? 0.96;

    // Build validation input
    const today = new Date().toISOString().split("T")[0];
    const validationInputs: ValidationServiceInput[] = items.map((item) => ({
      code: item.tardoc_code,
      referenceCode: item.ref_code || "",
      quantity: item.quantity,
      sessionNumber: 1,
      date: today,
      side: item.side_type ?? 0,
      tpValueMT: tpv,
      externalFactorMT: item.external_factor_mt ?? 1,
      tpValueTT: tpv,
      externalFactorTT: item.external_factor_tt ?? 1,
    }));

    const result = await validateServices(validationInputs, canton, lawEnum);

    // If validating a saved group, update its validation status
    if (groupId) {
      const validationMessage = result.valid
        ? `All ${items.length} services validated successfully`
        : result.services
            .filter((s) => !s.accepted)
            .map((s) => `${s.code}: ${s.errorMessage}`)
            .join("; ");

      await supabaseAdmin
        .from("tardoc_groups")
        .update({
          validation_status: result.valid ? "valid" : "invalid",
          validation_message: validationMessage,
          last_validated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", groupId);
    }

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("TarDoc group validation error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
