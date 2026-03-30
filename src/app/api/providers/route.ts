import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET() {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // First, check if Dr. Natalia Koltunova exists
    const { data: existingNatalia } = await supabase
      .from('providers')
      .select('id, name')
      .ilike('name', '%natalia%koltunova%')
      .single();
    
    // If Dr. Natalia Koltunova doesn't exist, add her
    if (!existingNatalia) {
      const { error: insertError } = await supabase
        .from('providers')
        .insert({
          name: 'Dr. Natalia Koltunova',
          email: 'info@maisontoa.com',
          specialty: 'Dermatology & Venereology'
        });
      
      if (insertError) {
        console.error('Error adding Dr. Natalia Koltunova:', insertError);
      } else {
        console.log('Dr. Natalia Koltunova added successfully');
      }
    }
    
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
