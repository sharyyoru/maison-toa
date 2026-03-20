"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabaseClient } from "@/lib/supabaseClient";
import { clearDemoCache } from "@/lib/demoMode";

interface CurrentUserInfo {
  fullName: string;
  initials: string;
  role: string;
  avatarUrl: string | null;
}

export default function HeaderUser() {
  const router = useRouter();
  const [userInfo, setUserInfo] = useState<CurrentUserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadUser() {
      const { data } = await supabaseClient.auth.getUser();
      if (!isMounted) return;

      const user = data.user;
      if (!user) {
        setUserInfo(null);
        setLoading(false);
        return;
      }

      const meta = (user.user_metadata || {}) as Record<string, unknown>;
      const firstName = (meta["first_name"] as string) || "";
      const lastName = (meta["last_name"] as string) || "";
      const role = ((meta["role"] as string) || "Staff").toString();
      const avatarUrl = (meta["avatar_url"] as string) || null;

      const fullName = [firstName, lastName].filter(Boolean).join(" ") ||
        (user.email ?? "User");

      const initialsSource = fullName || user.email || "?";
      const parts = initialsSource.split(" ");
      const initials = (parts[0]?.[0] ?? "").toUpperCase() +
        (parts[1]?.[0] ?? "").toUpperCase();

      setUserInfo({
        fullName,
        initials: initials || "U",
        role,
        avatarUrl,
      });
      setLoading(false);
    }

    loadUser();

    return () => {
      isMounted = false;
    };
  }, []);

  async function confirmLogout() {
    await supabaseClient.auth.signOut();
    clearDemoCache();
    router.replace("/login");
    router.refresh();
  }

  if (loading || !userInfo) {
    return (
      <div className="ml-1 flex items-center gap-2 rounded-full bg-white/80 px-2 py-1 text-[11px] text-slate-400 shadow-sm">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-[11px] font-medium text-slate-600">
          --
        </div>
        <div className="hidden flex-col sm:flex">
          <span className="font-medium">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => router.push("/profile")}
        className="ml-1 inline-flex items-center gap-2 rounded-full bg-white/80 px-2 py-1 text-[11px] shadow-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/70"
      >
        <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-sky-500 text-[11px] font-medium text-white">
          {userInfo.avatarUrl ? (
            <Image
              src={userInfo.avatarUrl}
              alt={userInfo.fullName || "Avatar"}
              width={28}
              height={28}
              className="h-full w-full object-cover"
            />
          ) : (
            <span>{userInfo.initials}</span>
          )}
        </div>
        <div className="hidden flex-col text-[11px] text-slate-700 sm:flex">
          <span className="font-medium truncate max-w-[120px]">
            {userInfo.fullName}
          </span>
          <span className="text-slate-400 capitalize">{userInfo.role}</span>
        </div>
      </button>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className="relative inline-flex h-8 w-8 items-center justify-center text-slate-500"
      >
        <span className="sr-only">Log out</span>
        <div className="power-button-bg absolute inset-0 rounded-full" />
        <Image
          src="/logos/power-button.png"
          alt="Log out"
          width={20}
          height={20}
          className="relative h-[18px] w-[18px]"
        />
      </button>

      {confirmOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-2xl border border-white/70 bg-white/95 p-4 text-xs shadow-[0_18px_40px_rgba(15,23,42,0.25)]">
            <h2 className="text-sm font-semibold text-slate-900">Sign out</h2>
            <p className="mt-1 text-xs text-slate-500">
              Are you sure you want to log out?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="inline-flex items-center rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 shadow-sm hover:bg-slate-50"
              >
                No
              </button>
              <button
                type="button"
                onClick={async () => {
                  setConfirmOpen(false);
                  await confirmLogout();
                }}
                className="inline-flex items-center rounded-full border border-sky-200/80 bg-sky-600 px-3 py-1.5 text-[11px] font-medium text-white shadow-[0_8px_20px_rgba(15,23,42,0.25)] hover:bg-sky-700"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
