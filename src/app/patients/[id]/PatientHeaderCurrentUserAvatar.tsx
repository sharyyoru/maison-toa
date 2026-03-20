"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { supabaseClient } from "@/lib/supabaseClient";

type CurrentUserAvatarInfo = {
  fullName: string;
  initials: string;
  avatarUrl: string | null;
};

export default function PatientHeaderCurrentUserAvatar() {
  const [user, setUser] = useState<CurrentUserAvatarInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadUser() {
      try {
        const { data } = await supabaseClient.auth.getUser();
        if (!isMounted) return;

        const authUser = data.user;
        if (!authUser) {
          setUser(null);
          setLoading(false);
          return;
        }

        const meta = (authUser.user_metadata || {}) as Record<string, unknown>;
        const first = (meta["first_name"] as string) || "";
        const last = (meta["last_name"] as string) || "";
        const fullName =
          [first, last].filter(Boolean).join(" ") || authUser.email || "User";
        const avatarUrl = (meta["avatar_url"] as string) || null;

        const initialsSource = fullName || authUser.email || "?";
        const parts = initialsSource.split(" ");
        const initials =
          (parts[0]?.[0] ?? "").toUpperCase() +
          (parts[1]?.[0] ?? "").toUpperCase();

        setUser({
          fullName,
          initials: initials || "U",
          avatarUrl,
        });
        setLoading(false);
      } catch {
        if (!isMounted) return;
        setUser(null);
        setLoading(false);
      }
    }

    void loadUser();

    return () => {
      isMounted = false;
    };
  }, []);

  if (loading || !user) {
    return (
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-[11px] font-medium text-slate-500">
        --
      </div>
    );
  }

  return (
    <div
      className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-sky-500 text-[11px] font-medium text-white shadow-sm"
      title={user.fullName}
    >
      {user.avatarUrl ? (
        <Image
          src={user.avatarUrl}
          alt={user.fullName || "User"}
          width={32}
          height={32}
          className="h-full w-full object-cover"
        />
      ) : (
        <span>{user.initials}</span>
      )}
    </div>
  );
}
