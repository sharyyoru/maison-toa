/**
 * Applies migration 20260414_upsert_treatments_and_assign_doctors.sql
 * via the Supabase JS client.
 * Run: node scripts/apply_upsert_treatments_and_doctors.mjs
 */
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env.local") });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Category UUIDs ─────────────────────────────────────────────────────────────
const CAT = {
  new_prem:   "82433cac-0cb7-4989-8ae3-4cc2c0eaf6e9",
  new_laser:  "13ec6dc4-8abf-4e9c-b1b5-884e70474f56",
  new_offres: "d7ac8c1d-4bc5-4944-8f9a-540fbe5c402f",
  new_soins:  "818d5765-95ea-4a55-9f70-169f89e8de58",
  exi_cons:   "dadd20d3-102a-437c-8460-313557ba6732",
  exi_laser:  "eaf0192f-5132-4f21-8216-83867adb9c03",
  exi_inj:    "ccfa9100-0998-4429-9168-f6e4f6aee61c",
  exi_derm:   "7375e326-86c5-402c-9ea0-f4c9aebe8b52",
  exi_perf:   "676b4739-5786-4ace-b870-b0ee457230ab",
  exi_offres: "db9f9c65-a3e1-414a-8b6b-88cfed39017b",
  exi_soins:  "961e20ca-f390-48c5-98bb-9e0056da2641",
};

// ── Treatment definitions: [name, [new_cat_id, exi_cat_id]] ───────────────────
const TREATMENTS = [
  // Consultations → new: Première consultations, exi: Consultation
  ...["Consultation laser & appareils médicaux","Consultation qualité de peau",
      "Chir. - Liposuccion","Chir. - Abdomen","Chir. - Seins","Chir. - Visage",
      "Chir. - Autres parties du corps","Fils tenseurs","Lobes Oreilles",
      "Rhinoplastie médicale (acide hyaluronique)","PRP cheveux","PRP + Exosome"]
    .map(n => [n, [CAT.new_prem, CAT.exi_cons]]),

  // Dermato → new: Première consultations, exi: Dermatologie Esthétique
  ...["Dermato. - Grain de beauté","Dermato. - Verrue"]
    .map(n => [n, [CAT.new_prem, CAT.exi_derm]]),

  // Perfusions → new: Première consultations, exi: Perfusions de vitamine
  ...["Perfusion - Hydratation","Perfusion - Hangover","Perfusion - Myers Cocktail",
      "Perfusion - Iron","Perfusion - Super Immunity","Perfusion - Energy",
      "Perfusion - Strong Hair","Perfusion - Post Workout","Perfusion - Skin Glow",
      "Perfusion - High Dose Vitamin C","Perfusion - All Inclusive","Perfusion - Detox"]
    .map(n => [n, [CAT.new_prem, CAT.exi_perf]]),

  // Injections → new: Première consultations, exi: Injections
  ...["Acide Hyaluronique","Toxine Botulique","Radiesse","Hyaluronidase","Sculptra",
      "Profhilo Visage","Profhilo Corps","Polynucléotides","Skinbooster"]
    .map(n => [n, [CAT.new_prem, CAT.exi_inj]]),

  // Laser & devices → both laser categories
  ...["ONDA (Traitement cellulite)",
      "Laser détatouage - Mini","Laser détatouage - Petit","Laser détatouage - Moyen",
      "Laser détatouage - Grand","Laser détatouage - Eye Liner",
      "Laser Pico Mélasma","Laser pigmentaire","Laser vasculaire",
      "HIFU - 100 lignes","HIFU - 200 lignes","HIFU - 400 lignes",
      "HIFU - 800 lignes","HIFU - 1300 lignes",
      "Coolsculpting","Coolsculpting Double Menton","Coolsculpting  Culotte de cheval",
      "Laser CO2","Miradry",
      "Laser épil. - Aisselles","Laser épil. - Lèvre sup OU menton",
      "Laser épil. - Lèvre sup ET menton","Laser épil. - Définition de la barbe OU visage",
      "Laser épil. - Avant-bras","Laser épil. - Fesses","Laser épil. - Pieds",
      "Laser épil. - Doigts de pieds OU mains","Laser épil. - Epaules",
      "Laser épil. - Haut ou bas du dos","Laser épil. - Nuque",
      "Laser épil. - Inter-fessière","Laser épil. - Ligne centrale du ventre",
      "Laser épil. - Sillon inter-fessier","Laser épil. - Poitrine / Thorax",
      "Laser épil. - Bikini (partiel)","Laser épil. - Bikini total",
      "Laser épil. - Bras complets","Laser épil. - Cuisses",
      "Laser épil. - Demi-jambes (mollet)","Laser épil. - Dos complet"]
    .map(n => [n, [CAT.new_laser, CAT.exi_laser]]),

  // Offres → both offres categories
  ...["Offre Saisonnale - Rituel collagène glow",
      "Offre Saisonnale - Silhouette ventre plat et tonique",
      "Offre Saisonnale - Silhouette galbe fessier",
      "Protocole 4 perfusions de vitamines","Protocole 3 séances - PRP",
      "Protocole 3 séances - Skinbooster","Protocole 1 séance - HIFU Ultraformer MPT",
      "Protocole 3 séances - Injection de Polynucléotides",
      "Protocole 2 séances - Profhilo","1 séance de Laser détatouage à 50%"]
    .map(n => [n, [CAT.new_offres, CAT.exi_offres]]),

  // Soins → both soins categories
  ...["PRP visage","Microneedling médicale Dermapen",
      "Peeling médical - Peeling TCA 15%","Peeling médical - Peeling TCA 20% + 10% Phénol",
      "Soin signature - Glass Skin","Soin signature - Skin Revival",
      "Soin signature - Vampirelift","Soin signature - Collagen Reset"]
    .map(n => [n, [CAT.new_soins, CAT.exi_soins]]),
];

// ── Doctor fragment → names mapping ───────────────────────────────────────────
// fragment used in ILIKE matching of doctor names in the DB
const LASER_TEAM = ["Ophelie Perrin","Claire Balbo","Juliette Le Mentec","Gwendoline Boursault"];
const MED_ALL    = ["Sophie Nordback","Alexandra Miles","Laetitia Guarino","Reda Benani","Natalia Koltunova","Adnan Plakalo"];
const MED_NORDBACK_MILES = ["Sophie Nordback","Alexandra Miles"];
const MED_MILES_BENANI   = ["Alexandra Miles","Reda Benani"];

// treatment fragment → doctor name fragments
const DOCTOR_ASSIGNMENTS = [
  ["Consultation laser",      ["Sophie Nordback","Alexandra Miles","Laetitia Guarino","Reda Benani"]],
  ["Consultation qualité",    ["Sophie Nordback","Alexandra Miles","Laetitia Guarino","Reda Benani"]],
  ["Chir. -",                 ["Sophie Nordback","Laetitia Guarino"]],
  ["Fils tenseurs",           ["Sophie Nordback","Alexandra Miles"]],
  ["Lobes Oreilles",          ["Sophie Nordback","Laetitia Guarino"]],
  ["Rhinoplastie médicale",   ["Sophie Nordback","Alexandra Miles","Natalia Koltunova","Adnan Plakalo"]],
  ["PRP cheveux",             ["Sophie Nordback","Alexandra Miles","Laetitia Guarino","Reda Benani"]],
  ["PRP + Exosome",           ["Sophie Nordback","Alexandra Miles","Laetitia Guarino","Reda Benani"]],
  ["Dermato. -",              ["Alexandra Miles","Natalia Koltunova"]],
  ["Perfusion -",             ["Alexandra Miles","Reda Benani"]],
  ["Acide Hyaluronique",      MED_ALL],
  ["Toxine Botulique",        MED_ALL],
  ["Radiesse",                MED_ALL],
  ["Hyaluronidase",           ["Sophie Nordback","Alexandra Miles"]],
  ["Sculptra",                MED_ALL],
  ["Profhilo Visage",         ["Sophie Nordback","Alexandra Miles","Natalia Koltunova","Adnan Plakalo"]],
  ["Profhilo Corps",          ["Sophie Nordback","Alexandra Miles","Natalia Koltunova","Adnan Plakalo"]],
  ["Polynucléotides",         ["Sophie Nordback","Alexandra Miles","Natalia Koltunova","Adnan Plakalo"]],
  ["Skinbooster",             ["Sophie Nordback","Alexandra Miles","Natalia Koltunova","Adnan Plakalo"]],
  ["ONDA",                    LASER_TEAM],
  ["Laser détatouage",        LASER_TEAM],
  ["Laser Pico",              LASER_TEAM],
  ["Laser pigmentaire",       LASER_TEAM],
  ["Laser vasculaire",        LASER_TEAM],
  ["HIFU",                    LASER_TEAM],
  ["Coolsculpting",           LASER_TEAM],
  ["Laser CO2",               LASER_TEAM],
  ["Miradry",                 LASER_TEAM],
  ["Laser épil.",             LASER_TEAM],
  ["Offre Saisonnale - Rituel",     ["Sophie Nordback","Alexandra Miles","Laetitia Guarino","Reda Benani","Natalia Koltunova"]],
  ["Offre Saisonnale - Silhouette ventre", ["Sophie Nordback","Alexandra Miles","Laetitia Guarino","Reda Benani","Natalia Koltunova"]],
  ["Offre Saisonnale - Silhouette galbe",  ["Sophie Nordback","Alexandra Miles","Laetitia Guarino","Reda Benani","Natalia Koltunova"]],
  ["Protocole 4 perfusions",  ["Alexandra Miles","Reda Benani"]],
  ["Protocole 3 séances - PRP",      ["Sophie Nordback","Alexandra Miles","Laetitia Guarino","Reda Benani","Natalia Koltunova","Adnan Plakalo"]],
  ["Protocole 3 séances - Skinbooster", ["Sophie Nordback","Alexandra Miles","Laetitia Guarino","Reda Benani","Natalia Koltunova","Adnan Plakalo"]],
  ["Protocole 1 séance - HIFU",      LASER_TEAM],
  ["Protocole 3 séances - Injection de Polynucléotides", ["Sophie Nordback","Alexandra Miles","Laetitia Guarino","Reda Benani","Natalia Koltunova","Adnan Plakalo"]],
  ["Protocole 2 séances - Profhilo", ["Sophie Nordback","Alexandra Miles","Laetitia Guarino","Reda Benani","Natalia Koltunova","Adnan Plakalo"]],
  ["1 séance de Laser",       LASER_TEAM],
  ["PRP visage",              LASER_TEAM],
  ["Microneedling",           LASER_TEAM],
  ["Peeling médical",         LASER_TEAM],
  ["Soin signature",          LASER_TEAM],
];

async function run() {
  // ── Load existing data ──────────────────────────────────────────────────────
  const { data: existingTreatments } = await sb
    .from("booking_treatments").select("id,name,category_id");
  const { data: allDoctors } = await sb
    .from("booking_doctors").select("id,name,order_index");

  console.log(`Existing treatments: ${existingTreatments.length}`);
  console.log(`Doctors: ${allDoctors.length}`);

  // ── Insert missing treatments ───────────────────────────────────────────────
  const toInsert = [];
  for (const [name, catIds] of TREATMENTS) {
    for (const catId of catIds) {
      const exists = existingTreatments.some(
        t => t.name === name && t.category_id === catId
      );
      if (!exists) toInsert.push({ name, category_id: catId, enabled: true });
    }
  }

  if (toInsert.length > 0) {
    const { error } = await sb.from("booking_treatments").insert(toInsert);
    if (error) throw error;
    console.log(`Inserted ${toInsert.length} new treatments.`);
  } else {
    console.log("All treatments already exist.");
  }

  // ── Reload treatments after insert ─────────────────────────────────────────
  const { data: allTreatments } = await sb
    .from("booking_treatments").select("id,name,category_id");

  // ── Collect all treatment IDs affected by this migration ───────────────────
  const allFragments = DOCTOR_ASSIGNMENTS.map(([f]) => f.toLowerCase());
  const affectedIds = new Set(
    allTreatments
      .filter(t => allFragments.some(f => t.name.toLowerCase().includes(f)))
      .map(t => t.id)
  );
  console.log(`Clearing assignments for ${affectedIds.size} treatments…`);

  if (affectedIds.size > 0) {
    const { error } = await sb
      .from("booking_treatment_doctors")
      .delete()
      .in("treatment_id", [...affectedIds]);
    if (error) throw error;
  }

  // ── Build new assignments ───────────────────────────────────────────────────
  const seen = new Set();
  const newAssignments = [];

  for (const [fragment, doctorNames] of DOCTOR_ASSIGNMENTS) {
    const frag = fragment.toLowerCase();
    const matchedTreatments = allTreatments.filter(t =>
      t.name.toLowerCase().includes(frag)
    );
    if (matchedTreatments.length === 0) {
      console.warn(`  ⚠  No treatment matched: "${fragment}"`);
    }
    for (const treatment of matchedTreatments) {
      for (let i = 0; i < doctorNames.length; i++) {
        const dFrag = doctorNames[i].toLowerCase();
        const doctor = allDoctors.find(d => d.name.toLowerCase().includes(dFrag));
        if (!doctor) {
          console.warn(`  ⚠  Doctor not found: "${doctorNames[i]}"`);
          continue;
        }
        const key = `${treatment.id}:${doctor.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          newAssignments.push({
            treatment_id: treatment.id,
            doctor_id: doctor.id,
            order_index: i,
          });
        }
      }
    }
  }

  // Insert in batches of 200
  let inserted = 0;
  for (let i = 0; i < newAssignments.length; i += 200) {
    const batch = newAssignments.slice(i, i + 200);
    const { error } = await sb
      .from("booking_treatment_doctors")
      .upsert(batch, { onConflict: "treatment_id,doctor_id" });
    if (error) throw error;
    inserted += batch.length;
  }

  console.log(`Inserted ${inserted} treatment-doctor assignments.`);
  console.log("Done.");
}

run().catch(err => { console.error(err); process.exit(1); });
