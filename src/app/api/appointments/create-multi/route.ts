import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generatePatientReminderEmail } from '@/lib/appointmentEmails';
import { normalizePatientLanguage } from '@/lib/languagePreference';
import { getBookingCalendarIntervals, type SecondaryCalendarPosition } from '@/lib/bookingCalendarIntervals';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const INTERNAL_ROLES = new Set(['admin', 'doctor', 'nurse', 'technician', 'staff']);

export async function POST(request: Request) {
  try {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: internalUser } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', authData.user.id)
      .maybeSingle();
    if (!internalUser?.role || !INTERNAL_ROLES.has(internalUser.role)) {
      return NextResponse.json({ error: 'Internal clinic access required' }, { status: 403 });
    }

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
      allowResourceOverlap = false,
      checkOnly = false,
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
    const recurrenceSeriesId = appointmentTimes.length > 1 ? crypto.randomUUID() : null;
    
    // Fetch service names if services are provided, or use custom text
    let serviceText = '';
    let selectedServices: Array<{
      id: string;
      name: string;
      mirror_calendar_provider_id: string | null;
      mirror_duration_minutes: number | null;
      mirror_position: SecondaryCalendarPosition;
    }> = [];
    if (serviceIds && serviceIds.length > 0) {
      const { data: services } = await supabase
        .from('services')
        .select('id, name, mirror_calendar_provider_id, mirror_duration_minutes, mirror_position')
        .in('id', serviceIds);

      selectedServices = (services || []).map((service) => ({
        id: service.id,
        name: service.name,
        mirror_calendar_provider_id: service.mirror_calendar_provider_id,
        mirror_duration_minutes: service.mirror_duration_minutes === null
          ? null
          : Number(service.mirror_duration_minutes),
        mirror_position: service.mirror_position === 'end' ? 'end' : 'start',
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
    const mirrorPosition = mirroredService?.mirror_position ?? 'start';
    let mirrorProviderName: string | null = null;
    let hasMirrorConflict = false;

    const getIntervals = (occurrence: { startTime: string; endTime: string }) => {
      const bookingStart = new Date(occurrence.startTime);
      const doctorDurationMinutes = (new Date(occurrence.endTime).getTime() - bookingStart.getTime()) / 60_000;
      return getBookingCalendarIntervals({
        bookingStart,
        primaryDurationMinutes: doctorDurationMinutes,
        secondaryDurationMinutes: mirrorDurationMinutes,
        secondaryPosition: mirrorPosition,
      });
    };

    if (mirrorProviderId && mirrorDurationMinutes) {
      const mirrorTooShort = mirrorPosition === 'end' && appointmentTimes.some((occurrence) => {
        const doctorDurationMinutes = (new Date(occurrence.endTime).getTime() - new Date(occurrence.startTime).getTime()) / 60_000;
        return mirrorDurationMinutes < doctorDurationMinutes;
      });
      if (mirrorTooShort) {
        return NextResponse.json(
          { error: 'For End placement, the mirrored appointment must be at least as long as the doctor appointment.' },
          { status: 400 },
        );
      }
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

      const mirrorIntervals = appointmentTimes.map((occurrence) => getIntervals(occurrence));
      const earliestMirrorStart = mirrorIntervals.reduce((earliest, intervals) =>
        intervals.secondaryCalendarStart! < earliest ? intervals.secondaryCalendarStart! : earliest,
      mirrorIntervals[0].secondaryCalendarStart!).toISOString();
      const latestMirrorEnd = mirrorIntervals.reduce((latest, intervals) =>
        intervals.secondaryCalendarEnd! > latest ? intervals.secondaryCalendarEnd! : latest,
      mirrorIntervals[0].secondaryCalendarEnd!).toISOString();

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

      hasMirrorConflict = (possibleConflicts || []).some((existing) =>
        mirrorIntervals.some((intervals) =>
          new Date(existing.start_time) < intervals.secondaryCalendarEnd!
            && new Date(existing.end_time) > intervals.secondaryCalendarStart!,
        ),
      );
    }

    const { data: patient } = !noPatient && patientId
      ? await supabase
          .from('patients')
          .select('id, first_name, last_name, email, gender, language_preference')
          .eq('id', patientId)
          .maybeSingle()
      : { data: null };

    // Internal users must explicitly confirm a practitioner overlap. This endpoint is
    // authenticated above; public/online booking flows must never send this override.
    let hasPractitionerConflict = false;
    let conflictingNames = '';
    if (!allowOverlap) {
      const doctorIntervals = appointmentTimes.map((appointmentTime) => ({
        appointmentTime,
        intervals: getIntervals(appointmentTime),
      }));
      const earliestStart = doctorIntervals.reduce((earliest, occurrence) =>
        occurrence.intervals.doctorCalendarStart < earliest ? occurrence.intervals.doctorCalendarStart : earliest,
      doctorIntervals[0].intervals.doctorCalendarStart);
      const latestEnd = doctorIntervals.reduce((latest, occurrence) =>
        occurrence.intervals.doctorCalendarEnd > latest ? occurrence.intervals.doctorCalendarEnd : latest,
      doctorIntervals[0].intervals.doctorCalendarEnd);

      const { data: overlapping } = await supabase
        .from('appointments')
        .select('id, provider_id, reason, start_time, end_time')
        .lt('start_time', latestEnd.toISOString())
        .gt('end_time', earliestStart.toISOString())
        .not('status', 'in', '(cancelled,no_show)')
        .in('provider_id', providerIds);

      const exactOverlaps = (overlapping || []).filter((existing) => doctorIntervals.some(({ intervals }) =>
        new Date(existing.start_time) < intervals.doctorCalendarEnd
          && new Date(existing.end_time) > intervals.doctorCalendarStart
      ));
      if (exactOverlaps.length > 0) {
        hasPractitionerConflict = true;
        const conflictingProviderIds = new Set(exactOverlaps.map((a: { provider_id: string }) => a.provider_id));
        conflictingNames = (providers || [])
          .filter((p: { id: string }) => conflictingProviderIds.has(p.id))
          .map((p: { name: string }) => p.name)
          .join(', ');
      }
    }

    const unapprovedConflicts = [
      ...(hasPractitionerConflict && !allowOverlap ? ['practitioner'] : []),
      ...(hasMirrorConflict && !allowResourceOverlap ? ['resource'] : []),
    ];
    if (unapprovedConflicts.length > 0) {
      const hasBothConflicts = unapprovedConflicts.length === 2;
      return NextResponse.json(
        {
          error: hasBothConflicts
            ? 'The practitioner and one of the required resources are not available at this time.'
            : unapprovedConflicts[0] === 'practitioner'
              ? `Scheduling conflict: ${conflictingNames} already has an appointment during this time.`
              : 'One of the required resources is not available at this time.',
          code: hasBothConflicts
            ? 'OVERLAP_CONFIRMATION_REQUIRED'
            : unapprovedConflicts[0] === 'practitioner'
              ? 'PRACTITIONER_UNAVAILABLE'
              : 'REQUIRED_RESOURCE_UNAVAILABLE',
          conflicts: unapprovedConflicts,
        },
        { status: 409 },
      );
    }

    if (checkOnly) {
      return NextResponse.json({ success: true, conflicts: [] });
    }

    // Create each logical occurrence and at most one linked mirror for it.
    const appointmentRows: Record<string, unknown>[] = [];
    for (const [occurrenceIndex, appointmentTime] of appointmentTimes.entries()) {
      const intervals = getIntervals(appointmentTime);
      const doctorDurationMinutes = Math.round(
        (new Date(appointmentTime.endTime).getTime() - new Date(appointmentTime.startTime).getTime()) / 60_000,
      );
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
          recurrence_series_id: recurrenceSeriesId,
          recurrence_sequence: recurrenceSeriesId ? occurrenceIndex : null,
          start_time: intervals.doctorCalendarStart.toISOString(),
          end_time: intervals.doctorCalendarEnd.toISOString(),
          status: status || 'scheduled',
          reason,
          notes: notes ? notes.replace(/[<>]/g, '') : null,
          location: location || null,
          source: 'manual',
          ...(serviceIds && serviceIds.length > 0 ? { service_ids: serviceIds } : {}),
          ...(machineIds && machineIds.length > 0 ? { machine_ids: machineIds } : {}),
          tracking_params: {
            patient_appointment_start: intervals.patientStart.toISOString(),
            appointment_duration_minutes: String(doctorDurationMinutes),
            doctor_calendar_position: mirrorPosition,
          },
        });
      }

      if (anchorAppointmentId && mirrorProviderId && mirrorDurationMinutes && mirrorProviderName) {
        const mirrorStart = intervals.secondaryCalendarStart!;
        const mirrorEnd = intervals.secondaryCalendarEnd!;
        appointmentRows.push({
          id: crypto.randomUUID(),
          patient_id: noPatient ? null : patientId,
          no_patient: Boolean(noPatient),
          provider_id: mirrorProviderId,
          appointment_group_id: providerIds.length > 1 ? appointmentGroupId : null,
          recurrence_series_id: recurrenceSeriesId,
          recurrence_sequence: recurrenceSeriesId ? occurrenceIndex : null,
          start_time: mirrorStart.toISOString(),
          end_time: mirrorEnd.toISOString(),
          status: status || 'scheduled',
          reason: `${anchorReason} [Linked Calendar: ${mirrorProviderName}]`,
          notes: notes ? notes.replace(/[<>]/g, '') : null,
          location: location || null,
          source: 'manual',
          service_ids: serviceIds,
          machine_ids: [],
          linked_parent_appointment_id: anchorAppointmentId,
          tracking_params: {
            patient_appointment_start: intervals.patientStart.toISOString(),
            appointment_duration_minutes: String(doctorDurationMinutes),
            doctor_calendar_position: mirrorPosition,
          },
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
          const trackingParams = (appointment.tracking_params || {}) as Record<string, string>;
          const appointmentDate = new Date(trackingParams.patient_appointment_start || appointment.start_time);
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
