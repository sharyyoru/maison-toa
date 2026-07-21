import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  validateServices,
  type ValidationServiceInput,
} from "@/lib/sumexTardoc";
import { autofillGroupRefs } from "@/lib/groupRefAutofill";
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
    const { groupId, items: adHocItems, canton: adHocCanton, law_type: adHocLaw, tax_point_value: adHocTpv } = body as {
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
      tax_point_value?: number | null;
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
      tariff_type?: string;
      sort_order: number;
    }>;
    let canton: string;
    let lawType: string;
    let tpvOverride: number | null = null;

    if (groupId) {
      // Load from DB
      const { data: group, error: groupError } = await supabaseAdmin
        .from("tardoc_groups")
        .select("canton, law_type, tax_point_value")
        .eq("id", groupId)
        .single();

      if (groupError || !group) {
        return NextResponse.json({ error: "Group not found" }, { status: 404 });
      }

      const { data: dbItems, error: itemsError } = await supabaseAdmin
        .from("tardoc_group_items")
        .select("tardoc_code, quantity, ref_code, side_type, tp_mt, tp_tt, external_factor_mt, external_factor_tt, tariff_type")
        .eq("group_id", groupId)
        .order("sort_order", { ascending: true });

      if (itemsError || !dbItems || dbItems.length === 0) {
        return NextResponse.json({ error: "No items in group" }, { status: 400 });
      }

      items = dbItems.map((i: any, index: number) => ({
        tardoc_code: i.tardoc_code,
        quantity: i.quantity ?? 1,
        ref_code: i.ref_code || undefined,
        side_type: i.side_type ?? 0,
        tp_mt: i.tp_mt ?? 0,
        tp_tt: i.tp_tt ?? 0,
        external_factor_mt: i.external_factor_mt ?? 1,
        external_factor_tt: i.external_factor_tt ?? 1,
        tariff_type: i.tariff_type ?? "007",
        sort_order: index,
      }));
      canton = group.canton || "VD";
      lawType = group.law_type || "KVG";
      tpvOverride = group.tax_point_value != null ? Number(group.tax_point_value) : null;
    } else if (adHocItems && adHocItems.length > 0) {
      items = adHocItems.map((i, index) => ({
        tardoc_code: i.tardoc_code,
        quantity: i.quantity ?? 1,
        ref_code: i.ref_code || undefined,
        side_type: i.side_type ?? 0,
        tp_mt: i.tp_mt ?? 0,
        tp_tt: i.tp_tt ?? 0,
        external_factor_mt: i.external_factor_mt ?? 1,
        external_factor_tt: i.external_factor_tt ?? 1,
        sort_order: index,
      }));
      canton = adHocCanton || "VD";
      lawType = adHocLaw || "KVG";
      tpvOverride = adHocTpv != null ? Number(adHocTpv) : null;
    } else {
      return NextResponse.json({ error: "Provide groupId or items" }, { status: 400 });
    }

    // Map law type string to enum
    const lawMap: Record<string, number> = {
      KVG: 1, UVG: 2, IVG: 3, MVG: 4, VVG: 5,
    };
    const lawEnum = lawMap[lawType.toUpperCase()] ?? 1;

    // Get tax point value: explicit override (group-level or ad-hoc) > canton default
    const tpv = tpvOverride != null && tpvOverride > 0
      ? tpvOverride
      : (CANTON_TAX_POINT_VALUES[(canton as SwissCanton)] ?? 0.96);

    // Filter out material items (tariff_type=402, mat: prefix) — Sumex doesn't validate them.
    // Also skip AR.* room/infrastructure codes — they require a preceding treatment in the
    // IValidate session and always fail when validated standalone; they are valid on real invoices.
    const validateableItems = (items as Array<typeof items[number] & { tariff_type?: string }>)
      .filter((i) =>
        (i as any).tariff_type !== "402" &&
        !i.tardoc_code.startsWith("mat:") &&
        !i.tardoc_code.startsWith("acf:") &&
        !i.tardoc_code.startsWith("tma:"),
      );

    if (validateableItems.length === 0) {
      // Only materials/ACF — skip Sumex validation entirely
      if (groupId) {
        await supabaseAdmin.from("tardoc_groups").update({
          validation_status: "valid",
          validation_message: "No TARDOC codes to validate (materials/ACF only)",
          last_validated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", groupId);
      }
      return NextResponse.json({ success: true, valid: true, services: [], summary: undefined });
    }

    // Auto-resolve ref_code from catalog masterCode when ref_code is empty.
    // This prevents 422 errors when slave/detail codes are submitted without their master.
    const autofill = await autofillGroupRefs(
      validateableItems.map((item) => ({
        tardoc_code: item.tardoc_code,
        ref_code: item.ref_code || null,
        sort_order: item.sort_order,
      })),
    );
    const refsByOrder = new Map(autofill.items.map((item) => [item.sort_order, item.ref_code]));
    const resolvedItems = validateableItems.map((item) => ({
      ...item,
      ref_code: refsByOrder.get(item.sort_order) || item.ref_code,
    }));

    // Sort so master codes precede their slaves in the Sumex IValidate session.
    // Items without a ref_code (masters) sort before items whose ref_code matches a code already in the list.
    const codesInGroup = new Set(resolvedItems.map((i) => i.tardoc_code));
    const sortedItems = [...resolvedItems].sort((a, b) => {
      const aIsSlave = a.ref_code ? codesInGroup.has(a.ref_code) : false;
      const bIsSlave = b.ref_code ? codesInGroup.has(b.ref_code) : false;
      if (aIsSlave && !bIsSlave) return 1;
      if (!aIsSlave && bIsSlave) return -1;
      return 0;
    });

    // Build validation input
    const today = new Date().toISOString().split("T")[0];
    const validationInputs: ValidationServiceInput[] = sortedItems.map((item) => ({
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
