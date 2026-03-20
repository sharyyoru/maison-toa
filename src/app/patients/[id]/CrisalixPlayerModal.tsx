"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type ReconstructionType = "breast" | "face" | "body";

declare global {
  interface Window {
    CrisalixPlayer?: new (token: string) => {
      render: (mode: "surgeon" | "patient", options: Record<string, unknown>) => void;
    };
  }
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()!.split(";").shift() ?? null;
  return null;
}

const CRISALIX_PLAYER_SCRIPT_URL = `${(process.env.CRISALIX_API_BASE_URL ?? "https://api3d-staging.crisalix.com").replace(/\/$/, "")}/v2/player.js`;

let playerScriptLoading: Promise<void> | null = null;

function loadPlayerScriptOnce(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.CrisalixPlayer) return Promise.resolve();

  if (!playerScriptLoading) {
    playerScriptLoading = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        `script[src='${CRISALIX_PLAYER_SCRIPT_URL}']`,
      );
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("Failed to load player.js")));
        return;
      }

      const script = document.createElement("script");
      script.src = CRISALIX_PLAYER_SCRIPT_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load player.js"));
      document.body.appendChild(script);
    });
  }

  return playerScriptLoading;
}

export default function CrisalixPlayerModal({
  patientId,
  open,
  playerId,
  reconstructionType,
}: {
  patientId: string;
  open: boolean;
  playerId: string | null;
  reconstructionType: ReconstructionType | null;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !playerId || !reconstructionType) return;
    if (typeof window === "undefined") return;

    let cancelled = false;

    async function init() {
      try {
        setLoading(true);
        console.log("[Crisalix Player] Starting initialization...");
        
        await loadPlayerScriptOnce();
        if (cancelled || !window.CrisalixPlayer) {
          console.error("[Crisalix Player] Player script not loaded");
          return;
        }

        const token = getCookie("crisalix_player_token");
        console.log("[Crisalix Player] Token present:", !!token);
        
        if (!token) {
          console.error("[Crisalix Player] No player token found in cookies");
          setLoading(false);
          return;
        }

        const PlayerCtor = window.CrisalixPlayer;
        const player = new PlayerCtor(token);
        console.log("[Crisalix Player] Player instance created");

        const container = containerRef.current;
        if (!container) return;

        const reconstruction_type =
          reconstructionType === "breast"
            ? "mammo"
            : reconstructionType === "face"
              ? "face"
              : "body";

        const options: Record<string, unknown> = {
          container,
          reconstruction_type,
          player_id: playerId,
          locale: "en",
          autoplay: true,
        };

        console.log("[Crisalix Player] Rendering with options:", options);
        player.render("surgeon", options);
        console.log("[Crisalix Player] Render called successfully");
        
        if (!cancelled) {
          setLoading(false);
        }
      } catch (error) {
        console.error("[Crisalix Player] Error during initialization:", error);
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [open, playerId, reconstructionType]);

  if (!open || !playerId || !reconstructionType) {
    return null;
  }

  function handleClose() {
    router.push(`/patients/${patientId}?mode=medical`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
      <div className="relative flex h-[78vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 text-slate-50 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 py-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-sky-500 px-2 py-0.5 text-[10px] font-semibold text-white">
              3D Player
            </span>
            <span className="text-[11px] text-slate-300">
              Crisalix reconstruction viewer
            </span>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            aria-label="Close 3D player"
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>
        <div className="relative flex-1 bg-slate-950">
          <div ref={containerRef} className="h-full w-full" />
          {loading ? (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80">
              <div className="mb-3 h-10 w-10 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
              <p className="text-[11px] font-medium text-slate-200">
                Generating 3D simulation...
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
