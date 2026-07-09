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
 * Remove internal metadata that is appended to legacy appointment reason values.
 * The remaining text is safe for patient-facing treatment/service display.
 */
export function cleanAppointmentReason(reason: string | null | undefined): string {
  if (!reason) return "";

  return reason
    .replace(/\s*\[(?:Doctor|Category|Notes|Status|Lang):\s*[^\]]*\]/gi, "")
    .replace(/\s*\[Online Booking\]/gi, "")
    .replace(/\s*-\s*$/, "")
    .trim();
}

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

  // Fallback: use the reason field but strip out internal metadata tags.
  if (appointment.reason) {
    const title = cleanAppointmentReason(appointment.reason);
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
