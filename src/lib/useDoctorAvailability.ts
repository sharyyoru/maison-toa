import { useState, useEffect } from "react";

type DayAvailability = {
  start: string;
  end: string;
  available: boolean;
};

type AvailabilityData = {
  availability: Record<number, DayAvailability>;
  source: string;
  providerId?: string;
  userId?: string;
};

export function useDoctorAvailability(doctorName: string | undefined) {
  const [availability, setAvailability] = useState<Record<number, DayAvailability>>({});
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<string>("not_loaded");

  useEffect(() => {
    if (!doctorName) {
      setAvailability({});
      return;
    }

    setLoading(true);
    fetch(`/api/public/doctor-availability?doctorName=${encodeURIComponent(doctorName)}`)
      .then(res => res.json())
      .then((data: AvailabilityData) => {
        setAvailability(data.availability || {});
        setSource(data.source || "unknown");
      })
      .catch(err => {
        console.error("Error fetching doctor availability:", err);
        setAvailability({});
        setSource("error");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [doctorName]);

  return { availability, loading, source };
}

export function generateTimeSlotsFromDay(dayAvail: DayAvailability | undefined): string[] {
  if (!dayAvail || !dayAvail.available) return [];
  
  const slots: string[] = [];
  const [startHour, startMin] = dayAvail.start.split(":").map(Number);
  const [endHour, endMin] = dayAvail.end.split(":").map(Number);

  let h = startHour;
  let m = startMin;
  while (h < endHour || (h === endHour && m < endMin)) {
    slots.push(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
    m += 30;
    if (m >= 60) { m = 0; h += 1; }
  }
  return slots;
}

export function hasAvailabilityOnDayOfWeek(availability: Record<number, DayAvailability>, dayOfWeek: number): boolean {
  return !!(availability[dayOfWeek]?.available);
}
