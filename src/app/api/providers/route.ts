import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET() {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data, error } = await supabase
      .from('providers')
      .select('id, name, email, specialty')
      .order('name', { ascending: true });
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ 
      providers: data || [],
      count: data?.length || 0
    });
    
  } catch (error) {
    return NextResponse.json({ 
      error: 'Failed to fetch providers',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
