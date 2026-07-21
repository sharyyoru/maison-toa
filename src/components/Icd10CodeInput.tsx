"use client";

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
        {COMMON_TARDOC_ICD10_CODES.map(({ code, label }) => (
          <option key={code} value={code} label={`${code} — ${label}`} />
        ))}
      </datalist>
    </>
  );
}
