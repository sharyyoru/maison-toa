"use client";

import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";

type PropertyValue = {
  value: unknown;
  definition: { id: string; key: string; label: string; value_type: string } | { id: string; key: string; label: string; value_type: string }[] | null;
};

function display(value: unknown) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value === null || value === undefined || value === "") return "—";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export default function PatientCustomProperties({ patientId }: { patientId: string }) {
  const [properties, setProperties] = useState<PropertyValue[]>([]);
  useEffect(() => {
    supabaseClient.from("patient_property_values").select("value, definition:patient_property_definitions(id, key, label, value_type)").eq("patient_id", patientId)
      .then(({ data }) => setProperties((data || []) as unknown as PropertyValue[]));
  }, [patientId]);
  if (!properties.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Custom properties</p>
      <div className="grid grid-cols-2 gap-2">
        {properties.map((property) => {
          const definition = Array.isArray(property.definition) ? property.definition[0] : property.definition;
          if (!definition) return null;
          return <div key={definition.id} className="rounded-lg bg-white px-2.5 py-2 shadow-sm"><div className="text-[10px] text-slate-500">{definition.label}</div><div className="break-words text-xs font-medium text-slate-800">{display(property.value)}</div></div>;
        })}
      </div>
    </div>
  );
}

