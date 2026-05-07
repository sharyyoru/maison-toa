import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  try {
    const {
      patientId,
      providerIds,
      serviceIds,
      serviceQuantities,
      startTime,
      endTime,
      location,
      status,
      category,
      channel,
      notes,
      allowOverlap = false,
    } = await request.json();
    
    // Input validation
    if (!providerIds || !Array.isArray(providerIds) || providerIds.length === 0) {
      return NextResponse.json(
        { error: 'At least one doctor must be selected' },
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
    
    // Validate service quantities
    if (serviceQuantities) {
      for (const [serviceId, quantity] of Object.entries(serviceQuantities)) {
        const qty = quantity as number;
        if (qty < 1 || qty > 10) {
          return NextResponse.json(
            { error: 'Service quantities must be between 1 and 10' },
            { status: 400 }
          );
        }
      }
    }
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    // Generate unique group ID for this multi-doctor appointment
    const appointmentGroupId = crypto.randomUUID();
    
    // Fetch service names if services are provided
    let serviceText = '';
    if (serviceIds && serviceIds.length > 0) {
      const { data: services } = await supabase
        .from('services')
        .select('id, name')
        .in('id', serviceIds);
      
      serviceText = serviceIds
        .map((serviceId: string) => {
          const service = services?.find((s) => s.id === serviceId);
          const quantity = serviceQuantities?.[serviceId] || 1;
          const serviceName = service?.name || 'Unknown service';
          return quantity > 1 ? `${serviceName} (×${quantity})` : serviceName;
        })
        .join(', ');
    }
    
    // Fetch provider names
    const { data: providers } = await supabase
      .from('providers')
      .select('id, name')
      .in('id', providerIds);

    // Check for overlapping appointments for each provider (future bookings only)
    // Skip this check for internal calendar bookings (allowOverlap = true)
    if (!allowOverlap && new Date(startTime) > new Date()) {
      const { data: overlapping } = await supabase
        .from('appointments')
        .select('id, provider_id, reason')
        .lt('start_time', endTime)
        .gt('end_time', startTime)
        .not('status', 'in', '(cancelled,no_show)')
        .in('provider_id', providerIds);

      if (overlapping && overlapping.length > 0) {
        const conflictingProviderIds = new Set(overlapping.map((a: { provider_id: string }) => a.provider_id));
        const conflictingNames = (providers || [])
          .filter((p: { id: string }) => conflictingProviderIds.has(p.id))
          .map((p: { name: string }) => p.name)
          .join(', ');
        return NextResponse.json(
          { error: `Scheduling conflict: ${conflictingNames} already has an appointment during this time.` },
          { status: 409 }
        );
      }
    }

    // Create N separate appointment rows (one per doctor)
    const appointmentRows = providerIds.map((providerId: string) => {
      const provider = providers?.find((p) => p.id === providerId);
      const doctorName = provider?.name || 'Unknown';
      
      // Build reason field with service and doctor info for THIS specific doctor
      let reason = serviceText || 'Appointment';
      reason += ` [Doctor: ${doctorName}]`;
      
      if (category) {
        reason += ` [Category: ${category}]`;
      }
      
      if (notes) {
        // Sanitize notes
        const sanitizedNotes = notes.replace(/[<>]/g, '');
        reason += ` [Notes: ${sanitizedNotes}]`;
      }
      
      if (channel) {
        reason += ` [Status: ${channel}]`;
      }
      
      return {
        patient_id: patientId || null,
        provider_id: providerId,
        appointment_group_id: providerIds.length > 1 ? appointmentGroupId : null,
        start_time: startTime,
        end_time: endTime,
        status: status || 'scheduled',
        reason,
        location: location || null,
        source: 'manual'
      };
    });
    
    // Insert all appointments in a single transaction
    const { data: createdAppointments, error } = await supabase
      .from('appointments')
      .insert(appointmentRows)
      .select();
    
    if (error) {
      console.error('Error creating appointments:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      appointments: createdAppointments,
      appointmentGroupId: providerIds.length > 1 ? appointmentGroupId : null
    });
  } catch (error) {
    console.error('Error in create-multi endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
