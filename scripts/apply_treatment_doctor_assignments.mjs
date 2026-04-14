/**
 * One-off script: apply canonical first-time-patient treatment→doctor assignments.
 * Run with: node scripts/apply_treatment_doctor_assignments.mjs
 */
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Canonical mapping: treatment fragment → doctor names ─────────────────────
const ASSIGNMENTS = [
  ["Consultation Chirurgie Corps",                        ["Sophie Nordback", "Laetitia Guarino"]],
  ["Consultation Chirurgie Visage",                       ["Sophie Nordback", "Alexandra Miles"]],
  ["Consultation Chute de cheveux",                       ["Sophie Nordback", "Alexandra Miles", "Laetitia Guarino", "Reda Benani"]],
  ["Consultation Dermatologique",                         ["Alexandra Miles", "Natalia Koltunova"]],
  ["Consultation Médecine Longevité",                     ["Alexandra Miles", "Reda Benani"]],
  // Consultation Injections rows — fragments match both consultation and standalone treatments
  ["Acide Hyaluronique, Toxine",                          ["Sophie Nordback", "Alexandra Miles", "Laetitia Guarino", "Reda Benani", "Natalia Koltunova", "Adnan Plakalo"]],
  ["Profhilo, Polynucléotides",                           ["Sophie Nordback", "Alexandra Miles", "Natalia Koltunova", "Adnan Plakalo"]],
  ["Augmentation des fesses",                             ["Sophie Nordback", "Alexandra Miles", "Natalia Koltunova"]],
  ["Traitement de la transpiration",                      ["Sophie Nordback", "Alexandra Miles"]],
  ["Injections PRP Cheveux",                              ["Sophie Nordback", "Alexandra Miles", "Laetitia Guarino", "Reda Benani"]],
  ["Excision des grains de beauté",                       ["Alexandra Miles", "Natalia Koltunova"]],
  // Laser & devices
  ["ONDA Coolwaves",                                      ["Ophelie Perrin", "Claire Balbo", "Juliette Le Mentec", "Gwendoline Boursault"]],
  ["étatouage",                                           ["Ophelie Perrin", "Claire Balbo", "Juliette Le Mentec", "Gwendoline Boursault"]],
  ["Laser Pigmentaire",                                   ["Ophelie Perrin", "Claire Balbo", "Juliette Le Mentec", "Gwendoline Boursault"]],
  ["Laser vasculaire",                                    ["Ophelie Perrin", "Claire Balbo", "Juliette Le Mentec", "Gwendoline Boursault"]],
  ["ifu",                                                 ["Ophelie Perrin", "Claire Balbo", "Juliette Le Mentec", "Gwendoline Boursault"]],
  ["Coolsculpting",                                       ["Ophelie Perrin", "Claire Balbo", "Juliette Le Mentec", "Gwendoline Boursault"]],
  ["pilatoir",                                            ["Ophelie Perrin", "Claire Balbo", "Juliette Le Mentec", "Gwendoline Boursault"]],
  ["PRP visage",                                          ["Ophelie Perrin", "Claire Balbo", "Juliette Le Mentec", "Gwendoline Boursault"]],
  ["Microneedling",                                       ["Ophelie Perrin", "Claire Balbo", "Juliette Le Mentec", "Gwendoline Boursault"]],
  ["Peeling médical",                                     ["Ophelie Perrin", "Claire Balbo", "Juliette Le Mentec", "Gwendoline Boursault"]],
  ["Soin signature",                                      ["Ophelie Perrin", "Claire Balbo", "Juliette Le Mentec", "Gwendoline Boursault"]],
  // Offre Edition Limitée
  ["Rituel collagène glow",                               ["Sophie Nordback", "Alexandra Miles", "Laetitia Guarino", "Reda Benani", "Natalia Koltunova"]],
  ["Silhouette ventre plat",                              ["Sophie Nordback", "Alexandra Miles", "Laetitia Guarino", "Reda Benani", "Natalia Koltunova"]],
  ["Silhouette galbe fessier",                            ["Sophie Nordback", "Alexandra Miles", "Laetitia Guarino", "Reda Benani", "Natalia Koltunova"]],
  // Offre Découverte
  ["Protocole 4 perfusions",                              ["Alexandra Miles", "Reda Benani"]],
  ["Protocole 3 séances - PRP",                           ["Sophie Nordback", "Alexandra Miles", "Laetitia Guarino", "Reda Benani", "Natalia Koltunova", "Adnan Plakalo"]],
  ["Protocole 3 séances - Skinbooster",                   ["Sophie Nordback", "Alexandra Miles", "Laetitia Guarino", "Reda Benani", "Natalia Koltunova", "Adnan Plakalo"]],
  ["Protocole 3 séances - Injection de Polynucléotides",  ["Sophie Nordback", "Alexandra Miles", "Laetitia Guarino", "Reda Benani", "Natalia Koltunova", "Adnan Plakalo"]],
  ["Protocole 2 séances - Profhilo",                      ["Sophie Nordback", "Alexandra Miles", "Laetitia Guarino", "Reda Benani", "Natalia Koltunova", "Adnan Plakalo"]],
];

async function run() {
  // 1. Fetch all treatments and doctors once
  const { data: allTreatments, error: tErr } = await supabase
    .from("booking_treatments")
    .select("id, name");
  if (tErr) throw tErr;

  const { data: allDoctors, error: dErr } = await supabase
    .from("booking_doctors")
    .select("id, name");
  if (dErr) throw dErr;

  console.log(`Loaded ${allTreatments.length} treatments, ${allDoctors.length} doctors.`);

  // 2. Build lookup: fragment → matching treatment IDs
  //    (case-insensitive substring match, same logic as the SQL)
  const treatmentIdsByFragment = new Map();
  for (const [fragment] of ASSIGNMENTS) {
    const frag = fragment.toLowerCase();
    const matches = allTreatments.filter(t => t.name.toLowerCase().includes(frag));
    treatmentIdsByFragment.set(fragment, matches.map(t => t.id));
    if (matches.length === 0) {
      console.warn(`  ⚠  No treatments matched fragment: "${fragment}"`);
    }
  }

  // Build lookup: doctor name fragment → doctor ID
  const doctorIdByName = new Map();
  for (const doctor of allDoctors) {
    doctorIdByName.set(doctor.name, doctor.id);
  }

  // 3. Collect all treatment IDs that will be touched
  const allAffectedTreatmentIds = new Set();
  for (const ids of treatmentIdsByFragment.values()) {
    ids.forEach(id => allAffectedTreatmentIds.add(id));
  }

  // 4. Delete existing assignments for those treatments
  if (allAffectedTreatmentIds.size > 0) {
    const { error: delErr } = await supabase
      .from("booking_treatment_doctors")
      .delete()
      .in("treatment_id", [...allAffectedTreatmentIds]);
    if (delErr) throw delErr;
    console.log(`Deleted existing assignments for ${allAffectedTreatmentIds.size} treatments.`);
  }

  // 5. Build and insert new assignments
  const toInsert = [];
  for (const [fragment, doctorNames] of ASSIGNMENTS) {
    const treatmentIds = treatmentIdsByFragment.get(fragment) ?? [];
    for (const treatmentId of treatmentIds) {
      for (let i = 0; i < doctorNames.length; i++) {
        const doctorName = doctorNames[i];
        // Find doctor by partial name match
        const doctor = allDoctors.find(d =>
          d.name.toLowerCase().includes(doctorName.toLowerCase())
        );
        if (!doctor) {
          console.warn(`  ⚠  Doctor not found: "${doctorName}"`);
          continue;
        }
        toInsert.push({ treatment_id: treatmentId, doctor_id: doctor.id, order_index: i });
      }
    }
  }

  // Deduplicate (same treatment+doctor can appear from overlapping fragments)
  const seen = new Set();
  const deduped = toInsert.filter(r => {
    const key = `${r.treatment_id}:${r.doctor_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (deduped.length > 0) {
    const { error: insErr } = await supabase
      .from("booking_treatment_doctors")
      .upsert(deduped, { onConflict: "treatment_id,doctor_id" });
    if (insErr) throw insErr;
    console.log(`Inserted ${deduped.length} treatment-doctor assignments.`);
  }

  console.log("Done.");
}

run().catch(err => { console.error(err); process.exit(1); });
