import type { SupabaseClient } from "@supabase/supabase-js";

export type DepositBillingEntity = {
  id: string;
  name: string;
  iban: string | null;
  gln: string | null;
  zsr: string | null;
  billing_type?: string | null;
};

/**
 * BILL-010: doctors whose deposit invoices must be assigned to their DOCTOR
 * (medical) billing entity instead of the default SOINS (aesthetic) entity.
 * e.g. a deposit for Dr Plakalo goes to "Dr Adnan Plakalo", not "Soins Plakalo".
 */
const DEPOSIT_MEDICAL_ENTITY_DOCTORS = ["plakalo", "koltunova", "guarino", "benani"];

/**
 * Doctors whose deposit invoices must explicitly go to their SOINS
 * (aesthetic) entity. Listed for clarity even though this currently matches
 * the default fallback below — keeping it explicit protects against the
 * default ever changing without someone re-checking BILL-010.
 */
const DEPOSIT_AESTHETIC_ENTITY_DOCTORS = ["miles", "nordback"];

/**
 * Resolve the billing entity a deposit invoice for the given doctor should
 * be assigned to (BILL-010). Looks up the billing entities linked to the
 * doctor via the `doctor_id` foreign key (not name matching), then applies
 * the BILL-010 medical-vs-aesthetic override for the doctors it specifies.
 * Any doctor not covered by BILL-010 keeps the pre-existing default of
 * preferring the aesthetic/SOINS entity.
 */
export async function resolveDepositBillingEntity(
  supabase: SupabaseClient,
  doctorId: string | null | undefined,
  doctorName: string | null | undefined,
): Promise<DepositBillingEntity | null> {
  if (!doctorId) return null;

  const { data: entities } = await supabase
    .from("providers")
    .select("id, name, iban, gln, zsr, billing_type")
    .eq("role", "billing_entity")
    .eq("doctor_id", doctorId);

  if (!entities || entities.length === 0) return null;
  if (entities.length === 1) return entities[0] as DepositBillingEntity;

  const nameLC = (doctorName || "").toLowerCase();
  const wantsMedical = DEPOSIT_MEDICAL_ENTITY_DOCTORS.some((n) => nameLC.includes(n));
  const wantsAesthetic = DEPOSIT_AESTHETIC_ENTITY_DOCTORS.some((n) => nameLC.includes(n));

  if (wantsMedical) {
    const medical = entities.find((e: any) => e.billing_type !== "aesthetic");
    return (medical ?? entities[0]) as DepositBillingEntity;
  }

  if (wantsAesthetic) {
    const aesthetic = entities.find((e: any) => e.billing_type === "aesthetic");
    return (aesthetic ?? entities[0]) as DepositBillingEntity;
  }

  // Default (unchanged) behavior for doctors not covered by BILL-010.
  const aesthetic = entities.find((e: any) => e.billing_type === "aesthetic");
  return (aesthetic ?? entities[0]) as DepositBillingEntity;
}
