import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const { providers, providerIds, startTime, endTime, excludeAppointmentId } = await request.json();
    
    // Support both old format (providerIds) and new format (providers array)
    const providersArray = providers || (providerIds || []).map((id: string) => ({ id, name: '' }));
    
    // Input validation
    if (!providersArray || !Array.isArray(providersArray) || providersArray.length === 0) {
      return NextResponse.json(
        { error: 'providers must be a non-empty array' },
        { status: 400 }
      );
    }
    
    if (!startTime || !endTime) {
      return NextResponse.json(
        { error: 'startTime and endTime are required' },
        { status: 400 }
      );
    }
    
    // Validate timestamps
    const startDate = new Date(startTime);
    const endDate = new Date(endTime);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid timestamp format' },
        { status: 400 }
      );
    }
    
    if (endDate <= startDate) {
      return NextResponse.json(
        { error: 'endTime must be after startTime' },
        { status: 400 }
      );
    }
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    // Check conflicts for each provider in parallel
    const conflicts = await Promise.all(
      providersArray.map(async (provider: { id: string; name: string }) => {
        const providerId = provider.id;
        let doctorName = provider.name;
        
        // If name not provided, fetch from database
        if (!doctorName) {
          const { data: providerData } = await supabase
            .from('providers')
            .select('id, name')
            .eq('id', providerId)
            .single();
          
          if (!providerData) {
            return {
              providerId,
              providerName: 'Unknown',
              hasConflict: false,
              conflictingAppointments: [],
              error: 'Provider not found'
            };
          }
          
          doctorName = providerData.name;
        }
        
        console.log(`[Conflict Check] Checking conflicts for doctor: ${doctorName} (ID: ${providerId})`);
        
        // Build conflict detection query - check BOTH provider_id AND reason field
        // This handles both old appointments (doctor name in reason) and new appointments (provider_id)
        let query = supabase
          .from('appointments')
          .select(`
            id,
            start_time,
            end_time,
            location,
            reason,
            provider_id,
            patient:patients(first_name, last_name)
          `)
          .not('status', 'in', '(cancelled,no_show)')
          .lt('start_time', endTime)
          .gt('end_time', startTime);
        
        // Exclude current appointment if editing
        if (excludeAppointmentId) {
          query = query.neq('id', excludeAppointmentId);
        }
        
        const { data: allAppointments, error } = await query;
        
        console.log(`[Conflict Check] Found ${allAppointments?.length || 0} appointments in time range for filtering`);
        if (allAppointments && allAppointments.length > 0) {
          console.log(`[Conflict Check] Sample appointment:`, {
            id: allAppointments[0].id,
            provider_id: allAppointments[0].provider_id,
            reason: allAppointments[0].reason,
            start_time: allAppointments[0].start_time
          });
        }
        
        if (error) {
          console.error('Error checking conflicts:', error);
          return {
            providerId,
            providerName: doctorName || 'Unknown',
            hasConflict: false,
            conflictingAppointments: [],
            error: error.message
          };
        }
        
        // Filter appointments that match this doctor by provider_id OR doctor name in reason field
        const conflictingAppointments = (allAppointments || []).filter((appt: any) => {
          // Check if appointment has provider_id matching (new appointments)
          if (appt.provider_id === providerId) {
            console.log(`[Conflict Check] ✓ Match by provider_id: ${appt.id}`);
            return true;
          }
          
          // Check if appointment has doctor name in reason field (old appointments)
          // Format: [Doctor: Name] or [Doctors: Name1, Name2, ...]
          const reason = appt.reason || '';
          const doctorMatch = reason.match(/\[Doctors?:\s*([^\]]+)\]/);
          if (doctorMatch) {
            const doctorsInReason = doctorMatch[1];
            console.log(`[Conflict Check] Checking if "${doctorName}" is in "${doctorsInReason}"`);
            // Check if this doctor's name appears in the list
            if (doctorsInReason.includes(doctorName)) {
              console.log(`[Conflict Check] ✓ Match by doctor name in reason: ${appt.id}`);
              return true;
            }
          } else {
            console.log(`[Conflict Check] No [Doctor:] tag found in reason: "${reason}"`);
          }
          
          return false;
        });
        
        console.log(`[Conflict Check] Found ${conflictingAppointments.length} conflicts for ${doctorName}`);
        
        // Format conflict details
        const formattedConflicts = conflictingAppointments.map((appt: any) => ({
          appointmentId: appt.id,
          patientName: `${appt.patient?.first_name || ''} ${appt.patient?.last_name || ''}`.trim() || 'Unknown',
          startTime: appt.start_time,
          endTime: appt.end_time,
          location: appt.location || 'Unknown location'
        }));
        
        return {
          providerId,
          providerName: doctorName,
          hasConflict: formattedConflicts.length > 0,
          conflictingAppointments: formattedConflicts
        };
      })
    );
    
    return NextResponse.json({ conflicts });
  } catch (error) {
    console.error('Error in check-conflicts endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
