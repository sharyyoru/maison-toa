import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST() {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Add Dr. Natalia Koltunova to the providers table
    const { data, error } = await supabase
      .from('providers')
      .insert({
        name: 'Dr. Natalia Koltunova',
        email: 'info@maisontoa.com',
        specialty: 'Dermatology & Venereology'
      })
      .select()
      .single();
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ 
      message: 'Dr. Natalia Koltunova added successfully',
      provider: data
    });
    
  } catch (error) {
    return NextResponse.json({ 
      error: 'Failed to add provider',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
