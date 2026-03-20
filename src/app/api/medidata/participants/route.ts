import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { MediDataClient, type LawType } from "@/lib/medidataClient";

type MediDataConfigRow = {
  medidata_endpoint_url: string | null;
  medidata_client_id: string | null;
  medidata_username: string | null;
  medidata_password_encrypted: string | null;
  is_test_mode: boolean;
};

/**
 * GET /api/medidata/participants?lawType=KVG
 * Fetch list of insurers from MediData
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lawTypeParam = searchParams.get("lawType") || "KVG";

    // Map string to LawType number
    const lawTypeMap: Record<string, LawType> = {
      KVG: 1,
      UVG: 2,
      IVG: 3,
      MVG: 4,
      VVG: 5,
    };
    const lawType = lawTypeMap[lawTypeParam.toUpperCase()] || 1;

    // Get MediData config
    const { data: configData } = await supabaseAdmin
      .from("medidata_config")
      .select("medidata_endpoint_url, medidata_client_id, medidata_username, medidata_password_encrypted, is_test_mode")
      .limit(1)
      .single();

    const config = configData as MediDataConfigRow | null;

    if (!config?.medidata_endpoint_url || !config?.medidata_client_id || 
        !config?.medidata_username || !config?.medidata_password_encrypted) {
      // Fall back to database insurers if MediData not configured
      const { data: dbInsurers } = await supabaseAdmin
        .from("swiss_insurers")
        .select("id, gln, receiver_gln, name, name_fr, bag_number, tp_allowed, law_types, street, postal_code, city")
        .order("name");

      return NextResponse.json({
        source: "database",
        lawType: lawTypeParam,
        count: dbInsurers?.length || 0,
        participants: dbInsurers || [],
      });
    }

    // Create MediData client and fetch participants
    const medidataClient = new MediDataClient({
      baseUrl: config.medidata_endpoint_url,
      clientId: config.medidata_client_id,
      username: config.medidata_username,
      password: config.medidata_password_encrypted,
      isTestMode: config.is_test_mode,
    });

    const participants = await medidataClient.getParticipants(lawType);

    return NextResponse.json({
      source: "medidata",
      lawType: lawTypeParam,
      count: participants.length,
      participants,
    });
  } catch (error) {
    console.error("Error fetching participants:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/medidata/participants/sync
 * Sync insurers from MediData to local database
 */
export async function POST(request: NextRequest) {
  try {
    // Get MediData config
    const { data: configData } = await supabaseAdmin
      .from("medidata_config")
      .select("medidata_endpoint_url, medidata_client_id, medidata_username, medidata_password_encrypted, is_test_mode")
      .limit(1)
      .single();

    const config = configData as MediDataConfigRow | null;

    if (!config?.medidata_endpoint_url || !config?.medidata_client_id || 
        !config?.medidata_username || !config?.medidata_password_encrypted) {
      return NextResponse.json(
        { error: "MediData not configured" },
        { status: 400 }
      );
    }

    // Create MediData client
    const medidataClient = new MediDataClient({
      baseUrl: config.medidata_endpoint_url,
      clientId: config.medidata_client_id,
      username: config.medidata_username,
      password: config.medidata_password_encrypted,
      isTestMode: config.is_test_mode,
    });

    // Fetch participants for all law types
    const lawTypes: Array<{ type: LawType; name: string }> = [
      { type: 1, name: "KVG" },
      { type: 2, name: "UVG" },
      { type: 3, name: "IVG" },
      { type: 4, name: "MVG" },
      { type: 5, name: "VVG" },
    ];

    const allParticipants = new Map<string, {
      gln: string;
      name: string;
      bagNumber: string | null;
      receiverGln: string | null;
      lawTypes: string[];
      tpAllowed: boolean;
      address: {
        street: string | null;
        postalCode: string | null;
        city: string | null;
      } | null;
    }>();

    for (const { type, name } of lawTypes) {
      const participants = await medidataClient.getParticipants(type);

      for (const p of participants) {
        const existing = allParticipants.get(p.gln);
        if (existing) {
          // Add law type to existing entry
          if (!existing.lawTypes.includes(name)) {
            existing.lawTypes.push(name);
          }
          // Update TP allowed if any law type allows it
          if (p.tpAllowed) {
            existing.tpAllowed = true;
          }
        } else {
          allParticipants.set(p.gln, {
            gln: p.gln,
            name: p.name,
            bagNumber: p.bagNumber,
            receiverGln: p.receiverGln,
            lawTypes: [name],
            tpAllowed: p.tpAllowed,
            address: p.address,
          });
        }
      }
    }

    // Upsert to database
    let inserted = 0;
    let updated = 0;
    let errors = 0;

    for (const participant of allParticipants.values()) {
      try {
        // Check if exists
        const { data: existing } = await supabaseAdmin
          .from("swiss_insurers")
          .select("id")
          .eq("gln", participant.gln)
          .single();

        const upsertData = {
          gln: participant.gln,
          name: participant.name,
          name_fr: participant.name, // Use same name for now
          bag_number: participant.bagNumber,
          receiver_gln: participant.receiverGln,
          law_types: participant.lawTypes,
          tp_allowed: participant.tpAllowed,
          street: participant.address?.street || null,
          postal_code: participant.address?.postalCode || null,
          city: participant.address?.city || null,
          updated_at: new Date().toISOString(),
        };

        if (existing) {
          // Update
          await supabaseAdmin
            .from("swiss_insurers")
            .update(upsertData)
            .eq("id", existing.id);
          updated++;
        } else {
          // Insert
          await supabaseAdmin
            .from("swiss_insurers")
            .insert({
              ...upsertData,
              created_at: new Date().toISOString(),
            });
          inserted++;
        }
      } catch (error) {
        console.error(`Error upserting insurer ${participant.gln}:`, error);
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      totalFetched: allParticipants.size,
      inserted,
      updated,
      errors,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error syncing participants:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
