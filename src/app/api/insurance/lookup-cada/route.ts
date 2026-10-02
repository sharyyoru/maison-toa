import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getParticipants } from "@/lib/medidataProxy";

/**
 * BILL-016 – Automatic Insurance Information Retrieval from CADA Card Number
 *
 * GET /api/insurance/lookup-cada?cardNumber=80756XXXXXXXXXXXXXXX
 *
 * Swiss insurance card numbers (No CADA / VEKA) are 20 digits:
 *   80756 (country prefix) + 5-digit BAG insurer number + 10-digit serial.
 * The BAG number identifies the insurer, so we can resolve the insurer
 * without any manual entry:
 *   1. Local swiss_insurers table (bag_number column).
 *   2. Live Medidata participants list (bagNumber field) as fallback —
 *      matches are cached back into swiss_insurers for future lookups.
 */
export async function GET(req: NextRequest) {
  const raw = (req.nextUrl.searchParams.get("cardNumber") || "").replace(/[\s.-]/g, "");

  if (!/^80756\d{15}$/.test(raw)) {
    return NextResponse.json(
      { error: "Invalid card number. Expected 20 digits starting with 80756." },
      { status: 400 },
    );
  }

  const bagPadded = raw.slice(5, 10); // e.g. "01562"
  const bagUnpadded = String(parseInt(bagPadded, 10)); // e.g. "1562"

  try {
    // 1. Local lookup. A VEKA/CADA card is a KVG (LAMal) health-insurance
    // card, so when the insurer has several entities (e.g. "Helsana KVG" vs
    // "Helsana UVG/LAA"), pick the KVG one — accident (UVG/LAA) entities are
    // a different coverage and must not be auto-selected from the card.
    const { data: localRows } = await supabaseAdmin
      .from("swiss_insurers")
      .select("id, name, name_fr, gln, receiver_gln, bag_number, address_street, address_postal_code, address_city, tp_allowed")
      .in("bag_number", [bagPadded, bagUnpadded])
      .eq("is_active", true)
      .limit(20);

    const rows = localRows ?? [];
    const isAccidentEntity = (name: string | null) => /\b(uvg|laa|unfall|accident)\b/i.test(name || "");
    const hasRealGln = (gln: string | null) => !!gln && /^\d{13}$/.test(gln);
    const isKvgEntity = (name: string | null) => /\b(kvg|lamal)\b/i.test(name || "");

    const local =
      rows.find((r) => isKvgEntity(r.name) && hasRealGln(r.gln)) ??
      rows.find((r) => !isAccidentEntity(r.name) && hasRealGln(r.gln)) ??
      rows.find((r) => !isAccidentEntity(r.name)) ??
      rows[0] ??
      null;

    if (local) {
      return NextResponse.json({
        source: "database",
        bagNumber: bagUnpadded,
        lawType: "KVG",
        insurer: local,
      });
    }

    // 2. Medidata participants fallback
    const participants = await getParticipants({ limit: 5000 });
    const match = participants.find((p) => {
      const bag = String(p.bagNumber ?? "").trim();
      return bag === bagPadded || bag === bagUnpadded || (bag && String(parseInt(bag, 10)) === bagUnpadded);
    });

    if (!match) {
      return NextResponse.json(
        { error: "No insurer found for this card number.", bagNumber: bagUnpadded },
        { status: 404 },
      );
    }

    // Try to resolve the local insurer row by GLN so the patient record can
    // reference insurer_id; cache the bag number for future local lookups.
    let localId: string | null = null;
    const { data: byGln } = await supabaseAdmin
      .from("swiss_insurers")
      .select("id, bag_number")
      .eq("gln", match.glnParticipant)
      .limit(1)
      .maybeSingle();
    if (byGln) {
      localId = byGln.id;
      if (!byGln.bag_number) {
        await supabaseAdmin.from("swiss_insurers").update({ bag_number: bagUnpadded }).eq("id", byGln.id);
      }
    }

    return NextResponse.json({
      source: "medidata",
      bagNumber: bagUnpadded,
      insurer: {
        id: localId,
        name: match.name,
        gln: match.glnParticipant,
        receiver_gln: match.glnReceiver ?? null,
        address_street: match.street ?? null,
        address_postal_code: match.zipCode ?? null,
        address_city: match.town ?? null,
        law_types: match.lawTypes ?? null,
        tp_allowed: match.tgAllowed ?? null,
      },
    });
  } catch (err) {
    console.error("[lookup-cada] error:", err);
    return NextResponse.json({ error: "Insurance lookup failed" }, { status: 500 });
  }
}
