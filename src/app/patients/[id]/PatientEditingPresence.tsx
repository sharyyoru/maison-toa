"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { supabaseClient } from "@/lib/supabaseClient";

interface EditingUserInfo {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  initials: string;
}

export default function PatientEditingPresence({
  patientId,
}: {
  patientId: string;
}) {
  const [editingUser, setEditingUser] = useState<EditingUserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    let channel: ReturnType<typeof supabaseClient.channel> | null = null;
    let currentUserId: string | null = null;

    async function loadAndClaimLock() {
      try {
        const { data: authData } = await supabaseClient.auth.getUser();
        const authUser = authData?.user ?? null;
        currentUserId = authUser?.id ?? null;

        const { data: existingLock } = await supabaseClient
          .from("patient_edit_locks")
          .select("user_id, user_name, user_avatar_url")
          .eq("patient_id", patientId)
          .maybeSingle();

        let effectiveLock = existingLock;

        if (!effectiveLock && authUser) {
          const meta = (authUser.user_metadata || {}) as Record<string, unknown>;
          const first = (meta["first_name"] as string) || "";
          const last = (meta["last_name"] as string) || "";
          const fullName =
            [first, last].filter(Boolean).join(" ") || authUser.email || "User";
          const avatarUrl = (meta["avatar_url"] as string) || null;

          // Try to claim the lock if none exists yet. If another session
          // wins the race, ignore the duplicate and just read back the row.
          await supabaseClient
            .from("patient_edit_locks")
            .upsert(
              {
                patient_id: patientId,
                user_id: authUser.id,
                user_name: fullName,
                user_avatar_url: avatarUrl,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "patient_id", ignoreDuplicates: true },
            );

          const { data: refreshedLock } = await supabaseClient
            .from("patient_edit_locks")
            .select("user_id, user_name, user_avatar_url")
            .eq("patient_id", patientId)
            .maybeSingle();

          effectiveLock = refreshedLock ?? existingLock ?? null;
        }

        if (!isMounted) return;

        const lockData = effectiveLock;

        if (lockData) {
          const fullName = (lockData.user_name as string) || "User";
          const avatarUrl = (lockData.user_avatar_url as string | null) ?? null;
          const initialsSource = fullName || "User";
          const parts = initialsSource.split(" ");
          const initials =
            (parts[0]?.[0] ?? "").toUpperCase() +
            (parts[1]?.[0] ?? "").toUpperCase();

          setEditingUser({
            userId: (lockData.user_id as string) ?? "",
            fullName,
            avatarUrl,
            initials: initials || "U",
          });
        } else {
          setEditingUser(null);
        }

        setLoading(false);

        // Subscribe to realtime changes on this patient's lock
        channel = supabaseClient
          .channel(`patient-edit-locks-${patientId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "patient_edit_locks",
              filter: `patient_id=eq.${patientId}`,
            },
            (payload) => {
              if (!isMounted) return;

              if (payload.eventType === "DELETE") {
                setEditingUser(null);
                return;
              }

              const row = payload.new as any;
              if (!row) return;

              const fullName = (row.user_name as string) || "User";
              const avatarUrl = (row.user_avatar_url as string | null) ?? null;
              const initialsSource = fullName || "User";
              const parts = initialsSource.split(" ");
              const initials =
                (parts[0]?.[0] ?? "").toUpperCase() +
                (parts[1]?.[0] ?? "").toUpperCase();

              setEditingUser({
                userId: (row.user_id as string) ?? "",
                fullName,
                avatarUrl,
                initials: initials || "U",
              });
            },
          )
          .subscribe();
      } catch {
        if (!isMounted) return;
        setLoading(false);
      }
    }

    void loadAndClaimLock();

    return () => {
      isMounted = false;
      // If we own the lock, try to release it when unmounting
      if (currentUserId) {
        void supabaseClient
          .from("patient_edit_locks")
          .delete()
          .match({ patient_id: patientId, user_id: currentUserId });
      }
      if (channel) {
        void supabaseClient.removeChannel(channel);
      }
    };
  }, [patientId]);

  if (loading) {
    return (
      <div className="flex items-center gap-1 text-[11px] text-slate-500">
        <span className="text-[10px] uppercase tracking-wide text-slate-400">
          Currently editing
        </span>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-[11px] font-medium text-slate-500">
          --
        </div>
      </div>
    );
  }

  if (!editingUser) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 text-[11px] text-slate-600">
      <span className="text-[10px] uppercase tracking-wide text-slate-500">
        Currently editing
      </span>
      <div
        className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-sky-500 text-[11px] font-medium text-white shadow-sm"
        title={editingUser.fullName}
      >
        {editingUser.avatarUrl ? (
          <Image
            src={editingUser.avatarUrl}
            alt={editingUser.fullName || "User"}
            width={32}
            height={32}
            className="h-full w-full object-cover"
          />
        ) : (
          <span>{editingUser.initials}</span>
        )}
      </div>
    </div>
  );
}
