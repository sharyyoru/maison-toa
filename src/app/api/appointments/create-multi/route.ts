import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generatePatientReminderEmail } from '@/lib/appointmentEmails';
import { normalizePatientLanguage } from '@/lib/languagePreference';

export async function POST(request: Request) {
  try {
    const {
      patientId,
      noPatient = false,
      providerIds,
      serviceIds,
      serviceQuantities,
      customServiceText,
      startTime,
      endTime,
      occurrences,
      location,
      status,
      category,
      channel,
      notes,
      allowOverlap = false,
      machineIds = null,
      sendEmailNotification = false,
    } = await request.json();
    
    // Input validation
    if (!noPatient && !patientId) {
      return NextResponse.json(
        { error: 'A patient must be selected unless No patient is enabled' },
        { status: 400 }
      );
    }

    if (!providerIds || !Array.isArray(providerIds) || providerIds.length === 0) {
      return NextResponse.json(
        { error: 'At least one doctor must be selected' },
        { status: 400 }
      );
    }
    
    const requestedOccurrences = Array.isArray(occurrences)
      ? occurrences
          .map((occurrence: { startTime?: unknown; endTime?: unknown }) => ({
            startTime: typeof occurrence.startTime === 'string' ? occurrence.startTime : '',
            endTime: typeof occurrence.endTime === 'string' ? occurrence.endTime : '',
          }))
          .filter((occurrence) => occurrence.startTime && occurrence.endTime)
      : null;

    if ((!startTime || !endTime) && (!requestedOccurrences || requestedOccurrences.length === 0)) {
      return NextResponse.json(
        { error: 'startTime and endTime are required' },
        { status: 400 }
      );
    }

    const appointmentTimes = requestedOccurrences && requestedOccurrences.length > 0
      ? requestedOccurrences
      : [{ startTime, endTime }];

    if (appointmentTimes.length > 120) {
      return NextResponse.json(
        { error: 'Recurring appointments are limited to 120 occurrences.' },
        { status: 400 }
      );
    }

    for (const appointmentTime of appointmentTimes) {
      const startDate = new Date(appointmentTime.startTime);
      const endDate = new Date(appointmentTime.endTime);

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
    }
    
    // Validate service quantities
    if (serviceQuantities) {
      for (const quantity of Object.values(serviceQuantities)) {
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
    
    // Fetch service names if services are provided, or use custom text
    let serviceText = '';
    let selectedServices: Array<{
      id: string;
      name: string;
      mirror_calendar_provider_id: string | null;
      mirror_duration_minutes: number | null;
    }> = [];
    if (serviceIds && serviceIds.length > 0) {
      const { data: services } = await supabase
        .from('services')
        .select('id, name, mirror_calendar_provider_id, mirror_duration_minutes')
        .in('id', serviceIds);

      selectedServices = (services || []).map((service) => ({
        id: service.id,
        name: service.name,
        mirror_calendar_provider_id: service.mirror_calendar_provider_id,
        mirror_duration_minutes: service.mirror_duration_minutes === null
          ? null
          : Number(service.mirror_duration_minutes),
      }));
      
      serviceText = serviceIds
        .map((serviceId: string) => {
          const service = selectedServices.find((s) => s.id === serviceId);
          const quantity = serviceQuantities?.[serviceId] || 1;
          const serviceName = service?.name || 'Unknown service';
          return quantity > 1 ? `${serviceName} (×${quantity})` : serviceName;
        })
        .join(', ');
    } else if (customServiceText && typeof customServiceText === 'string' && customServiceText.trim()) {
      // Use custom free-form service text when no service IDs are selected
      serviceText = customServiceText.trim();
    }
    
    // Fetch provider names
    const { data: providers } = await supabase
      .from('providers')
      .select('id, name')
      .in('id', providerIds);

    const mirroredService = serviceIds?.length === 1
      ? selectedServices.find((service) => service.id === serviceIds[0])
      : null;
    const mirrorProviderId = mirroredService?.mirror_calendar_provider_id ?? null;
    const mirrorDurationMinutes = mirroredService?.mirror_duration_minutes ?? null;
    let mirrorProviderName: string | null = null;

    if (mirrorProviderId && mirrorDurationMinutes) {
      if (providerIds.includes(mirrorProviderId)) {
        return NextResponse.json(
          { error: 'The mirrored calendar must be different from the selected doctor calendar.' },
          { status: 400 },
        );
      }

      const { data: mirrorProvider, error: mirrorProviderError } = await supabase
        .from('providers')
        .select('id, name')
        .eq('id', mirrorProviderId)
        .maybeSingle();

      if (mirrorProviderError || !mirrorProvider) {
        return NextResponse.json({ error: 'The configured mirrored calendar is unavailable.' }, { status: 400 });
      }
      mirrorProviderName = mirrorProvider.name;

      const earliestMirrorStart = appointmentTimes.reduce(
        (earliest, occurrence) => occurrence.startTime < earliest ? occurrence.startTime : earliest,
        appointmentTimes[0].startTime,
      );
      const latestMirrorEnd = appointmentTimes.reduce((latest, occurrence) => {
        const end = new Date(new Date(occurrence.startTime).getTime() + mirrorDurationMinutes * 60 * 1000).toISOString();
        return end > latest ? end : latest;
      }, new Date(new Date(appointmentTimes[0].startTime).getTime() + mirrorDurationMinutes * 60 * 1000).toISOString());

      const { data: possibleConflicts, error: mirrorConflictError } = await supabase
        .from('appointments')
        .select('id, start_time, end_time')
        .eq('provider_id', mirrorProviderId)
        .lt('start_time', latestMirrorEnd)
        .gt('end_time', earliestMirrorStart)
        .not('status', 'in', '(cancelled,no_show)');

      if (mirrorConflictError) {
        return NextResponse.json({ error: 'Failed to verify the mirrored calendar.' }, { status: 500 });
      }

      const hasMirrorConflict = (possibleConflicts || []).some((existing) =>
        appointmentTimes.some((occurrence) => {
          const mirrorEnd = new Date(new Date(occurrence.startTime).getTime() + mirrorDurationMinutes * 60 * 1000);
          return new Date(existing.start_time) < mirrorEnd && new Date(existing.end_time) > new Date(occurrence.startTime);
        }),
      );

      if (hasMirrorConflict) {
        return NextResponse.json(
          { error: `${mirrorProviderName} is not available for the configured mirrored appointment.` },
          { status: 409 },
        );
      }
    }

    const { data: patient } = !noPatient && patientId
      ? await supabase
          .from('patients')
          .select('id, first_name, last_name, email, gender, language_preference')
          .eq('id', patientId)
          .maybeSingle()
      : { data: null };

    // Check for overlapping appointments for each provider (future bookings only)
    // Skip this check for internal calendar bookings (allowOverlap = true)
    if (!allowOverlap) {
      const earliestStart = appointmentTimes.reduce((earliest, appointmentTime) => {
        return new Date(appointmentTime.startTime) < new Date(earliest.startTime)
          ? appointmentTime
          : earliest;
      }, appointmentTimes[0]);
      const latestEnd = appointmentTimes.reduce((latest, appointmentTime) => {
        return new Date(appointmentTime.endTime) > new Date(latest.endTime)
          ? appointmentTime
          : latest;
      }, appointmentTimes[0]);

      if (new Date(earliestStart.startTime) <= new Date()) {
        // Existing behavior only checks future bookings. Skip past ranges.
      } else {
      const { data: overlapping } = await supabase
        .from('appointments')
        .select('id, provider_id, reason')
        .lt('start_time', latestEnd.endTime)
        .gt('end_time', earliestStart.startTime)
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
    }

    // Create each logical occurrence and at most one linked mirror for it.
    const appointmentRows: Record<string, unknown>[] = [];
    for (const appointmentTime of appointmentTimes) {
      let anchorAppointmentId: string | null = null;
      let anchorReason = serviceText || 'Appointment';
      for (const providerId of providerIds as string[]) {
        const appointmentId = crypto.randomUUID();
        if (!anchorAppointmentId) anchorAppointmentId = appointmentId;
        const provider = providers?.find((p) => p.id === providerId);
        const doctorName = provider?.name || 'Unknown';
        let reason = `${serviceText || 'Appointment'} [Doctor: ${doctorName}]`;
        if (category) reason += ` [Category: ${category}]`;
        if (notes) reason += ` [Notes: ${notes.replace(/[<>]/g, '')}]`;
        if (channel) reason += ` [Status: ${channel}]`;
        if (appointmentId === anchorAppointmentId) anchorReason = reason;

        appointmentRows.push({
          id: appointmentId,
          patient_id: noPatient ? null : patientId,
          no_patient: Boolean(noPatient),
          provider_id: providerId,
          appointment_group_id: providerIds.length > 1 ? appointmentGroupId : null,
          start_time: appointmentTime.startTime,
          end_time: appointmentTime.endTime,
          status: status || 'scheduled',
          reason,
          notes: notes ? notes.replace(/[<>]/g, '') : null,
          location: location || null,
          source: 'manual',
          ...(serviceIds && serviceIds.length > 0 ? { service_ids: serviceIds } : {}),
          ...(machineIds && machineIds.length > 0 ? { machine_ids: machineIds } : {}),
        });
      }

      if (anchorAppointmentId && mirrorProviderId && mirrorDurationMinutes && mirrorProviderName) {
        const mirrorEnd = new Date(
          new Date(appointmentTime.startTime).getTime() + mirrorDurationMinutes * 60 * 1000,
        );
        appointmentRows.push({
          id: crypto.randomUUID(),
          patient_id: noPatient ? null : patientId,
          no_patient: Boolean(noPatient),
          provider_id: mirrorProviderId,
          appointment_group_id: providerIds.length > 1 ? appointmentGroupId : null,
          start_time: appointmentTime.startTime,
          end_time: mirrorEnd.toISOString(),
          status: status || 'scheduled',
          reason: `${anchorReason} [Linked Calendar: ${mirrorProviderName}]`,
          notes: notes ? notes.replace(/[<>]/g, '') : null,
          location: location || null,
          source: 'manual',
          service_ids: serviceIds,
          machine_ids: [],
          linked_parent_appointment_id: anchorAppointmentId,
        });
      }
    }
    
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

    let remindersScheduled = 0;
    if (sendEmailNotification && patient?.email && createdAppointments?.length) {
      const language = normalizePatientLanguage(patient.language_preference, 'fr');
      const patientLastName = patient.last_name || patient.first_name || 'Patient';
      const reminderRows = createdAppointments
        .map((appointment) => {
          const appointmentDate = new Date(appointment.start_time);
          if (Number.isNaN(appointmentDate.getTime())) return null;

          const reminderDate = new Date(appointmentDate);
          reminderDate.setDate(reminderDate.getDate() - 1);
          if (reminderDate.getTime() <= Date.now()) return null;

          return {
            patient_id: patient.id,
            appointment_id: appointment.id,
            recipient_type: 'patient',
            recipient_email: patient.email,
            subject: language === 'fr' ? 'Rappel de votre rendez-vous' : 'Appointment reminder',
            body: generatePatientReminderEmail(
              patientLastName,
              patient.gender || undefined,
              appointmentDate,
              serviceText || 'Consultation',
              language,
              appointment.id
            ),
            scheduled_for: reminderDate.toISOString(),
            status: 'pending',
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

      if (reminderRows.length > 0) {
        const { error: reminderError } = await supabase
          .from('scheduled_emails')
          .insert(reminderRows);

        if (reminderError) {
          console.error('Error scheduling appointment reminder emails:', reminderError);
        } else {
          remindersScheduled = reminderRows.length;
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      appointments: createdAppointments,
      appointmentGroupId: providerIds.length > 1 ? appointmentGroupId : null,
      remindersScheduled,
    });
  } catch (error) {
    console.error('Error in create-multi endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
