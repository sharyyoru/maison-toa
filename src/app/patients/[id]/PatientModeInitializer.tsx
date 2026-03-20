"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";

export default function PatientModeInitializer({
  patientId,
}: {
  patientId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const currentMode = searchParams.get("mode");
    if (currentMode === "crm" || currentMode === "medical") {
      return;
    }

    const crmIntentParam =
      searchParams.get("composeEmail") ??
      searchParams.get("compose") ??
      searchParams.get("createTask");
    if (crmIntentParam) {
      return;
    }

    let isCancelled = false;

    void (async () => {
      try {
        const { data } = await supabaseClient.auth.getUser();
        const user = data.user;
        if (!user || isCancelled) return;

        const meta = (user.user_metadata || {}) as Record<string, unknown>;
        const rawPriority = (meta["priority_mode"] as string) || "";
        const preferredMode: "crm" | "medical" =
          rawPriority === "medical" ? "medical" : "crm";

        if (preferredMode === "crm") {
          return;
        }

        const params = new URLSearchParams(searchParams.toString());
        params.set("mode", preferredMode);

        router.replace(`/patients/${patientId}?${params.toString()}`);
      } catch {
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [patientId, router]);

  return null;
}
