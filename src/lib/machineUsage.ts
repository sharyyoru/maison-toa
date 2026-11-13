import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingInterval } from "@/lib/exactBookingAvailability";

export type TreatmentMachine = {
  machineId: string;
  name: string;
  maxConcurrent: number;
};

/** Machine required by a booking treatment: its own machine_id, else its linked service's machine. */
export async function resolveTreatmentMachine(
  supabase: SupabaseClient,
  treatmentId: string | null | undefined,
): Promise<TreatmentMachine | null> {
  if (!treatmentId || treatmentId === "none") return null;
  const { data: treatment, error } = await supabase
    .from("booking_treatments")
    .select("machine_id, linked_service_id")
    .eq("id", treatmentId)
    .maybeSingle();
  if (error) throw error;

  let machineId: string | null = treatment?.machine_id ?? null;
  if (!machineId && treatment?.linked_service_id) {
    const { data: mapping, error: mappingError } = await supabase
      .from("service_machines")
      .select("machine_id")
      .eq("service_id", treatment.linked_service_id)
      .limit(1)
      .maybeSingle();
    if (mappingError) throw mappingError;
    machineId = mapping?.machine_id ?? null;
  }
  if (!machineId) return null;

  const { data: machine, error: machineError } = await supabase
    .from("machines")
    .select("name, max_concurrent")
    .eq("id", machineId)
    .maybeSingle();
  if (machineError) throw machineError;
  return {
    machineId,
    name: machine?.name || "required machine",
    maxConcurrent: machine?.max_concurrent ?? 1,
  };
}

type UsageRow = {
  id: string;
  appointment_group_id: string | null;
  linked_parent_appointment_id: string | null;
  start_time: string;
  end_time: string;
  machine_ids: string[] | null;
  service_ids: string[] | null;
  booking_treatment_id: string | null;
};

/**
 * Appointments occupying a machine between `start` and `end`. Besides rows
 * explicitly tagged with the machine, this includes appointments with no
 * machine tag whose service or booking treatment requires the machine —
 * staff-created calendar entries are frequently saved without machine_ids,
 * and ignoring them let online bookings double-book the device.
 */
export async function fetchMachineUsageIntervals(
  supabase: SupabaseClient,
  machineId: string,
  start: string,
  end: string,
): Promise<BookingInterval[]> {
  const [{ data: serviceRows, error: serviceError }, { data: treatmentRows, error: treatmentError }] =
    await Promise.all([
      supabase.from("service_machines").select("service_id").eq("machine_id", machineId),
      supabase.from("booking_treatments").select("id").eq("machine_id", machineId),
    ]);
  if (serviceError) throw serviceError;
  if (treatmentError) throw treatmentError;

  const serviceIds = (serviceRows || []).map((row) => row.service_id as string);
  const treatmentIds = (treatmentRows || []).map((row) => row.id as string);
  const filters = [`machine_ids.cs.{${machineId}}`];
  if (serviceIds.length > 0) filters.push(`service_ids.ov.{${serviceIds.join(",")}}`);
  if (treatmentIds.length > 0) filters.push(`booking_treatment_id.in.(${treatmentIds.join(",")})`);

  const { data, error } = await supabase
    .from("appointments")
    .select("id, appointment_group_id, linked_parent_appointment_id, start_time, end_time, machine_ids, service_ids, booking_treatment_id")
    .or(filters.join(","))
    .lt("start_time", end)
    .gt("end_time", start)
    .not("status", "in", "(cancelled,no_show)");
  if (error) throw error;

  const serviceSet = new Set(serviceIds);
  const treatmentSet = new Set(treatmentIds);
  return ((data || []) as UsageRow[])
    .filter((row) => {
      // An explicit machine selection is authoritative.
      if (row.machine_ids && row.machine_ids.length > 0) return row.machine_ids.includes(machineId);
      return (row.service_ids || []).some((id) => serviceSet.has(id))
        || (!!row.booking_treatment_id && treatmentSet.has(row.booking_treatment_id));
    })
    .map((row) => ({
      start: new Date(row.start_time),
      end: new Date(row.end_time),
      // Mirrored linked-calendar rows are the same machine use as their parent.
      groupId: row.appointment_group_id || row.linked_parent_appointment_id || row.id,
    }));
}
