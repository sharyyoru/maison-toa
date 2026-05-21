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

    if (role) {
      const roles = role.split(",").map(r => r.trim());
      query = roles.length === 1 ? query.eq("role", roles[0]) : query.in("role", roles);
    }

    const { data, error } = await query;

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ providers: data || [], count: data?.length || 0 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch providers' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json();
    
    const { name, email, specialty } = body;
    
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    
    const { data, error } = await supabase
      .from('providers')
      .insert({
        name: name.trim(),
        email: email || null,
        specialty: specialty || null,
        role: 'provider',
      })
      .select('id, name, email, specialty, role')
      .single();
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ provider: data });
  } catch (error) {
    return NextResponse.json({ 
      error: 'Failed to create provider',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
