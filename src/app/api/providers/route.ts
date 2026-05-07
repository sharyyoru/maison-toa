import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(req: Request) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { searchParams } = new URL(req.url);
    const role = searchParams.get("role");

    let query = supabase
      .from('providers')
      .select('id, name, email, specialty, role, iban, gln, zsr')
      .order('name', { ascending: true });

    if (role) query = query.eq('role', role);

    const { data, error } = await query;

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ providers: data || [], count: data?.length || 0 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch providers' }, { status: 500 });
  }
}
