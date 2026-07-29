import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";

export type AppointmentStatusOption = {
  id: string;
  name: string;
  emoji: string;
  display_order: number;
};

// Used while the database is loading and on installations where the migration
// has not been applied yet.
export const DEFAULT_APPOINTMENT_STATUSES = [
  "Aucune sélection",
  "Vidéo conférence / appel",
  "Bon/Solde/Voucher",
  "CONTROLE INFOS PATIENT",
  "PAIEMENT PARTIEL",
  "FACTURATION TARMED",
  "PAYE",
  "FACTURE ENVOYEE",
  "CB",
  "Salle d'attente",
  "Chez le médecin/dans la salle de consult.",
  "Patient parti, hors du cabinet",
  "à faire",
  "fait",
  "Attention",
  "Annulé",
  "Téléphone",
  "N'est pas venu",
  "en retard",
  "à payer",
  "Urgent",
  "Déplacé",
  "MANQUE",
  "NUIT",
  "ESPECES",
] as const;

export const DEFAULT_STATUS_EMOJIS: Record<string, string> = {
  "Salle d'attente": "🕐",
  "Chez le médecin/dans la salle de consult.": "👤",
  fait: "☑",
  Attention: "⚠️",
  "Annulé": "☒",
  "N'est pas venu": "🚫",
  "en retard": "📞",
  Urgent: "🆘",
  "Déplacé": "📝",
};

export function useAppointmentStatusOptions(): AppointmentStatusOption[] {
  const [statuses, setStatuses] = useState<AppointmentStatusOption[]>(
    DEFAULT_APPOINTMENT_STATUSES.map((name, display_order) => ({
      id: `default-${display_order}`,
      name,
      emoji: DEFAULT_STATUS_EMOJIS[name] ?? "",
      display_order,
    }))
  );

  useEffect(() => {
    let active = true;

    supabaseClient
      .from("appointment_status_options")
      .select("id, name, emoji, display_order")
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .then(({ data, error }) => {
        if (!active || error || !data?.length) return;
        setStatuses(data.map((row) => ({ ...row, emoji: row.emoji ?? "" })));
      });

    return () => {
      active = false;
    };
  }, []);

  return statuses;
}

export function useAppointmentStatuses(): string[] {
  return useAppointmentStatusOptions().map((status) => status.name);
}
