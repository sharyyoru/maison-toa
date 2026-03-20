/**
 * Utility functions for handling appointments with backward compatibility
 * for old appointments that have notes/title embedded in the reason field
 */

export type AppointmentWithNotes = {
  reason: string | null;
  notes?: string | null;
  title?: string | null;
  location?: string | null;
  [key: string]: any;
};

/**
 * Extract notes from an appointment, with fallback to parsing the reason field
 * for old appointments created before the notes column was added
 */
export function getAppointmentNotes(appointment: AppointmentWithNotes): string | null {
  // Try new dedicated column first
  if (appointment.notes) {
    return appointment.notes;
  }

  // Fallback: parse old reason field for [Notes: ...] pattern
  if (appointment.reason) {
    const notesMatch = appointment.reason.match(/\[Notes:\s*([^\]]+)\]/);
    if (notesMatch && notesMatch[1]) {
      return notesMatch[1].trim();
    }
  }

  return null;
}

/**
 * Extract title from an appointment, with fallback to parsing the reason field
 * for old appointments created before the title column was added
 */
export function getAppointmentTitle(appointment: AppointmentWithNotes): string | null {
  // Try new dedicated column first
  if (appointment.title) {
    return appointment.title;
  }

  // Fallback: use the reason field (which contains patient name and service)
  // but strip out the [Doctor: ...] and [Notes: ...] parts
  if (appointment.reason) {
    let title = appointment.reason;
    
    // Remove [Doctor: ...] pattern
    title = title.replace(/\s*\[Doctor:\s*[^\]]+\]/g, '');
    
    // Remove [Notes: ...] pattern
    title = title.replace(/\s*\[Notes:\s*[^\]]+\]/g, '');
    
    return title.trim() || null;
  }

  return null;
}

/**
 * Get a clean display name for the appointment (patient name + service)
 * without doctor or notes information
 */
export function getAppointmentDisplayName(appointment: AppointmentWithNotes): string {
  const title = getAppointmentTitle(appointment);
  
  if (title) {
    return title;
  }

  // Fallback to reason if no title
  return appointment.reason || "Appointment";
}

/**
 * Extract doctor name from the reason field (for old appointments)
 * New appointments should use a dedicated provider/user relationship
 */
export function getAppointmentDoctor(appointment: AppointmentWithNotes): string | null {
  if (!appointment.reason) {
    return null;
  }

  const doctorMatch = appointment.reason.match(/\[Doctor:\s*([^\]]+)\]/);
  if (doctorMatch && doctorMatch[1]) {
    return doctorMatch[1].trim();
  }

  return null;
}
