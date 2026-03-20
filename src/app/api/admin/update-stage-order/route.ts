import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const STAGE_ORDER = [
  'request for information',
  'appointment set',
  'moment reflection',
  'image pending',
  'request for insurance support',
  'operation scheduled',
  'closed won',
  'closed lost',
  'abandoned / unanswered'
];

export async function POST() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Missing Supabase credentials" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: stages, error } = await supabase
      .from('deal_stages')
      .select('id, name, sort_order');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const updates = [];

    for (let i = 0; i < STAGE_ORDER.length; i++) {
      const stageName = STAGE_ORDER[i];
      const stage = stages?.find(s => s.name.toLowerCase() === stageName.toLowerCase());
      
      if (stage) {
        const newSortOrder = i + 1;
        updates.push({
          id: stage.id,
          name: stage.name,
          oldOrder: stage.sort_order,
          newOrder: newSortOrder
        });
        
        const { error: updateError } = await supabase
          .from('deal_stages')
          .update({ sort_order: newSortOrder })
          .eq('id', stage.id);

        if (updateError) {
          return NextResponse.json({ error: updateError.message }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      updates,
      message: 'Stage order updated successfully'
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
