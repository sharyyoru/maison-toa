export const PATIENT_COLORS = [
  { chip: "border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-300 hover:bg-sky-100", avatar: "bg-sky-600", page: "bg-sky-50/40" },
  { chip: "border-violet-200 bg-violet-50 text-violet-700 hover:border-violet-300 hover:bg-violet-100", avatar: "bg-violet-600", page: "bg-violet-50/40" },
  { chip: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100", avatar: "bg-emerald-600", page: "bg-emerald-50/40" },
  { chip: "border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300 hover:bg-amber-100", avatar: "bg-amber-600", page: "bg-amber-50/40" },
  { chip: "border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100", avatar: "bg-rose-600", page: "bg-rose-50/40" },
  { chip: "border-cyan-200 bg-cyan-50 text-cyan-700 hover:border-cyan-300 hover:bg-cyan-100", avatar: "bg-cyan-600", page: "bg-cyan-50/40" },
  { chip: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 hover:border-fuchsia-300 hover:bg-fuchsia-100", avatar: "bg-fuchsia-600", page: "bg-fuchsia-50/40" },
  { chip: "border-lime-200 bg-lime-50 text-lime-700 hover:border-lime-300 hover:bg-lime-100", avatar: "bg-lime-600", page: "bg-lime-50/40" },
] as const;

export function getPatientColor(patientId: string) {
  let hash = 0;
  for (let index = 0; index < patientId.length; index += 1) {
    hash = (hash * 31 + patientId.charCodeAt(index)) >>> 0;
  }
  return PATIENT_COLORS[hash % PATIENT_COLORS.length];
}
