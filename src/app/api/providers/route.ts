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
    
    const { name, email, specialty, role, short_code } = body;
    
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    
    // Validate role - must be one of the allowed values
    const validRoles = ['billing_entity', 'doctor', 'nurse', 'technician'];
    const providerRole = role && validRoles.includes(role) ? role : 'doctor';
    
    const { data, error } = await supabase
      .from('providers')
      .insert({
        name: name.trim(),
        email: email || null,
        specialty: specialty || null,
        role: providerRole,
        short_code: short_code?.trim() || null,
      })
      .select('id, name, email, specialty, role, short_code')
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

export async function PUT(req: Request) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json();
    
    const { id, name, email, specialty, role, short_code } = body;
    
    if (!id) {
      return NextResponse.json({ error: 'Provider ID is required' }, { status: 400 });
    }
    
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    
    // Validate role if provided
    const validRoles = ['billing_entity', 'doctor', 'nurse', 'technician'];
    const updateData: Record<string, unknown> = {
      name: name.trim(),
      email: email || null,
      specialty: specialty || null,
      short_code: short_code?.trim() || null,
    };
    
    if (role && validRoles.includes(role)) {
      updateData.role = role;
    }
    
    const { data, error } = await supabase
      .from('providers')
      .update(updateData)
      .eq('id', id)
      .select('id, name, email, specialty, role, short_code')
      .single();
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ provider: data });
  } catch (error) {
    return NextResponse.json({ 
      error: 'Failed to update provider',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    
    if (!id) {
      return NextResponse.json({ error: 'Provider ID is required' }, { status: 400 });
    }
    
    // Check if provider has any appointments
    const { count } = await supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('provider_id', id);
    
    if (count && count > 0) {
      return NextResponse.json({ 
        error: 'Cannot delete provider with existing appointments',
        appointmentCount: count 
      }, { status: 400 });
    }
    
    const { error } = await supabase
      .from('providers')
      .delete()
      .eq('id', id);
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ 
      error: 'Failed to delete provider',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
