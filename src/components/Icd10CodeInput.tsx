"use client";

import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";

export type Icd10Code = {
  code: string;
  label: string;
};

export const COMMON_TARDOC_ICD10_CODES: Icd10Code[] = [
  { code: "L68.0", label: "Laser hyperpilosité" },
  { code: "F64.0", label: "Laser pour patient transgenre" },
  { code: "L72.0", label: "Kyste épidermoïde / épilation laser due à un kyste" },
  { code: "B07", label: "Verrue" },
  { code: "L71.9", label: "Rosacée" },
  { code: "L70.9", label: "Acné" },
  { code: "L72.1", label: "Kyste pilaire (cuir chevelu)" },
  { code: "D23.9", label: "Excision de lésion cutanée bénigne" },
  { code: "D48.5", label: "Lésion cutanée d'évolution incertaine" },
  { code: "D22.9", label: "Naevus (grain de beauté)" },
  { code: "D18.0", label: "Angiome rubis" },
  { code: "I78.1", label: "Télangiectasies" },
  { code: "L90.5", label: "Cicatrice" },
  { code: "L91.0", label: "Cicatrice chéloïdienne" },
  { code: "L81.1", label: "Mélasma" },
  { code: "L81.4", label: "Lentigos solaires" },
  { code: "L81.9", label: "Trouble de la pigmentation" },
  { code: "L20.9", label: "Dermatite atopique" },
  { code: "L30.9", label: "Dermatite / Eczéma" },
  { code: "L40.9", label: "Psoriasis" },
  { code: "L64.9", label: "Alopécie androgénétique" },
  { code: "L63.9", label: "Pelade (alopécie areata)" },
  { code: "L65.9", label: "Chute de cheveux diffuse" },
  { code: "R61.0", label: "Hyperhidrose localisée" },
  { code: "B35.1", label: "Onychomycose" },
  { code: "B35.4", label: "Mycose cutanée" },
  { code: "B08.1", label: "Molluscum contagiosum" },
  { code: "B00.1", label: "Herpès labial" },
  { code: "B02.9", label: "Zona" },
  { code: "L50.9", label: "Urticaire" },
  { code: "L29.9", label: "Prurit" },
  { code: "Z48.0", label: "Contrôle avec ablation des fils" },
  { code: "Z48.8", label: "Contrôle postopératoire" },
  { code: "Z09", label: "Contrôle après traitement" },
  { code: "Z41.1", label: "Consultation / chirurgie à visée esthétique" },
  // BILL-014 — codes added 09.2026 (liste de Mélissa)
  { code: "L57.0", label: "Kératose actinique" },
  { code: "C44.0", label: "Carcinome cutané malin de la lèvre" },
  { code: "C44.1", label: "Carcinome cutané malin de la paupière" },
  { code: "C44.2", label: "Carcinome cutané malin de l'oreille" },
  { code: "C44.3", label: "Carcinome cutané malin du visage (nez, joue, front, menton…)" },
  { code: "C44.4", label: "Carcinome cutané malin du cuir chevelu et du cou" },
  { code: "C44.5", label: "Carcinome cutané malin du tronc" },
  { code: "C44.6", label: "Carcinome cutané malin du membre supérieur / épaule" },
  { code: "C44.7", label: "Carcinome cutané malin du membre inférieur / hanche" },
  { code: "C44.9", label: "Carcinome cutané malin, localisation non précisée" },
  { code: "D04.9", label: "Carcinome cutané in situ / maladie de Bowen, localisation non précisée" },
  { code: "C43.9", label: "Mélanome malin cutané, localisation non précisée" },
  { code: "D03.9", label: "Mélanome in situ, localisation non précisée" },
  { code: "Z71.9", label: "Conseil médical, sans précision" },
  { code: "Z76.0", label: "Renouvellement d'une prescription" },
];

type Icd10CodeInputProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onAdd: () => void;
  placeholder: string;
  className?: string;
};

export default function Icd10CodeInput({
  id,
  value,
  onChange,
  onAdd,
  placeholder,
  className,
}: Icd10CodeInputProps) {
  const datalistId = `${id}-options`;
  const [codes, setCodes] = useState<Icd10Code[]>(COMMON_TARDOC_ICD10_CODES);

  useEffect(() => {
    let active = true;
    supabaseClient
      .from("icd10_code_options")
      .select("code, label")
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .then(({ data, error }) => {
        if (!active || error) return;
        if (data && data.length > 0) {
          setCodes(data.map((row) => ({ code: row.code, label: row.label })));
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <input
        id={id}
        type="text"
        list={datalistId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          onAdd();
        }}
        placeholder={placeholder}
        className={className}
      />
      <datalist id={datalistId}>
        {codes.map(({ code, label }) => (
          <option key={code} value={code} label={`${code} — ${label}`} />
        ))}
      </datalist>
    </>
  );
}
