"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/AuthContext";
import { supabaseClient } from "@/lib/supabaseClient";

type Favorite = {
  href: string;
  icon: string;
};

const STORAGE_KEY = "blz-favorites";

const DEFAULT_FAVORITES: Favorite[] = [
  { href: "/", icon: "home" },
  { href: "/patients", icon: "patients" },
  { href: "/appointments", icon: "calendar" },
  { href: "/deals", icon: "deals" },
  { href: "/financials", icon: "financials" },
  { href: "/search", icon: "search" },
];

const KNOWN_FAVORITES: Record<
  string,
  { icon: string; labelKey?: string; label?: string }
> = {
  "/": { icon: "home", labelKey: "dashboard" },
  "/patients": { icon: "patients", labelKey: "patients" },
  "/patients/new": { icon: "patients", labelKey: "patients" },
  "/appointments": { icon: "calendar", labelKey: "calendar" },
  "/deals": { icon: "deals", labelKey: "dealsAndPipeline" },
  "/financials": { icon: "financials", labelKey: "financials" },
  "/search": { icon: "search", label: "Search" },
  "/tasks": { icon: "tasks", labelKey: "tasks" },
};

function getFavoriteLabel(
  href: string,
  tNav: (key: string) => string
): string {
  const known = KNOWN_FAVORITES[href];
  if (known?.labelKey) return tNav(known.labelKey);
  if (known?.label) return known.label;

  if (typeof document !== "undefined" && document.title) {
    const title = document.title.split(/[|\-–]/)[0].trim();
    if (title) return title;
  }

  const last = href.split("/").filter(Boolean).pop() || "";
  if (last) return last.charAt(0).toUpperCase() + last.slice(1);
  return "Page";
}

function normalizeFavorite(href: string): Favorite | null {
  if (href === "/") return { href: "/", icon: "home" };

  if (KNOWN_FAVORITES[href]) {
    return { href, icon: KNOWN_FAVORITES[href].icon };
  }

  for (const [base, { icon }] of Object.entries(KNOWN_FAVORITES)) {
    if (base !== "/" && href.startsWith(base + "/")) {
      return { href: base, icon };
    }
  }

  return { href, icon: "custom" };
}

async function fetchFavoritesFromDb(userId: string): Promise<Favorite[] | null> {
  const { data, error } = await supabaseClient
    .from("favorites")
    .select("href, icon, sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });
  if (error || !data) {
    console.error("Failed to load favorites from DB:", error);
    return null;
  }
  return data.map((row) => ({ href: row.href as string, icon: row.icon as string }));
}

async function syncFavoritesToDb(userId: string, favorites: Favorite[]) {
  const rows = favorites.map((f, i) => ({
    user_id: userId,
    href: f.href,
    icon: f.icon,
    sort_order: i,
  }));
  const { error: deleteError } = await supabaseClient
    .from("favorites")
    .delete()
    .eq("user_id", userId);
  if (deleteError) {
    console.error("Failed to delete favorites:", deleteError);
    return;
  }
  if (rows.length > 0) {
    const { error: insertError } = await supabaseClient.from("favorites").insert(rows);
    if (insertError) console.error("Failed to insert favorites:", insertError);
  }
}

function FavoriteIcon({ icon, className }: { icon: string; className?: string }) {
  const props = { className: className ?? "h-5 w-5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (icon) {
    case "home":
      return (
        <svg {...props}>
          <path d="M4 11.5 12 4l8 7.5" />
          <path d="M5 10.5V20h4v-5h6v5h4v-9.5" />
        </svg>
      );
    case "patients":
      return (
        <svg {...props}>
          <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
          <path d="M4 20a6 6 0 0 1 8-5.29A6 6 0 0 1 20 20" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 11h18" />
        </svg>
      );
    case "deals":
      return (
        <svg {...props}>
          <path d="M3 6h4v12H3zM10 10h4v8h-4zM17 8h4v10h-4z" />
        </svg>
      );
    case "financials":
      return (
        <svg {...props}>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M7 10h4M7 14h2" />
        </svg>
      );
    case "search":
      return (
        <svg className={className ?? "h-4.5 w-4.5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
      );
    case "tasks":
      return (
        <svg {...props}>
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      );
    case "custom":
    default:
      return (
        <svg {...props} strokeWidth={2}>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      );
  }
}

function TooltipIcon({
  href,
  label,
  isActive,
  onClick,
  onRemove,
  ariaLabel,
  children,
}: {
  href?: string;
  label: string;
  isActive?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  ariaLabel?: string;
  children: ReactNode;
}) {
  const baseClasses =
    "flex h-9 w-9 items-center justify-center rounded-full border transition-all duration-200";
  const activeClasses =
    "border-sky-400/60 bg-sky-500/10 text-sky-500 dark:text-sky-400";
  const inactiveClasses =
    "border-[var(--blz-border)] text-[var(--blz-text-muted)] hover:border-sky-400 hover:bg-sky-500/10 hover:text-sky-500 dark:hover:text-sky-200 hover:shadow-[0_0_16px_rgba(56,189,248,0.35)] hover:scale-105";

  return (
    <div className="group relative flex items-center justify-center">
      {href ? (
        <Link
          href={href}
          aria-label={ariaLabel ?? label}
          className={`${baseClasses} ${isActive ? activeClasses : inactiveClasses}`}
        >
          {children}
        </Link>
      ) : (
        <button
          type="button"
          onClick={onClick}
          aria-label={ariaLabel ?? label}
          className={`${baseClasses} ${isActive ? activeClasses : inactiveClasses}`}
        >
          {children}
        </button>
      )}
      <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[var(--blz-surface-elevated)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--blz-text-primary)] opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
        {label}
        <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-[var(--blz-surface-elevated)]" />
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onRemove();
          }}
          className="pointer-events-none absolute -right-1 -top-1 z-20 flex h-4 w-4 items-center justify-center rounded-full bg-slate-500 text-[10px] leading-none text-white opacity-0 shadow-sm transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 hover:bg-red-500 focus:pointer-events-auto focus:opacity-100"
          aria-label={`Remove ${label}`}
        >
          ×
        </button>
      )}
    </div>
  );
}

export default function FavoritesBar() {
  const pathname = usePathname();
  const tNav = useTranslations("nav");
  const { user, loading } = useAuth();
  const [favorites, setFavorites] = useState<Favorite[]>(DEFAULT_FAVORITES);
  const [loaded, setLoaded] = useState(false);
  const skipDbSyncRef = useRef(true);

  useEffect(() => {
    if (loading) return;
    async function load() {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as Favorite[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setFavorites(parsed);
            setLoaded(true);
            return;
          }
        } catch {
          // ignore corrupt storage
        }
      }

      if (user) {
        const dbFavorites = await fetchFavoritesFromDb(user.id);
        if (dbFavorites && dbFavorites.length > 0) {
          setFavorites(dbFavorites);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(dbFavorites));
          setLoaded(true);
          return;
        }

        // Seed DB with defaults when both localStorage and DB are empty
        setFavorites(DEFAULT_FAVORITES);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_FAVORITES));
        await syncFavoritesToDb(user.id, DEFAULT_FAVORITES);
      }

      setLoaded(true);
    }
    void load();
  }, [loading, user]);

  useEffect(() => {
    if (loaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
    }
  }, [favorites, loaded]);

  useEffect(() => {
    if (!loaded || !user) return;
    if (skipDbSyncRef.current) {
      skipDbSyncRef.current = false;
      return;
    }
    void syncFavoritesToDb(user.id, favorites);
  }, [favorites, loaded, user]);

  const isActive = useCallback(
    (href: string) => {
      if (href === "/") return pathname === "/";
      return pathname.startsWith(href);
    },
    [pathname]
  );

  const currentFavorite = pathname ? normalizeFavorite(pathname) : null;
  const isCurrentFavorite = currentFavorite
    ? favorites.some((f) => f.href === currentFavorite.href)
    : false;

  function toggleCurrentFavorite() {
    if (!currentFavorite) return;
    if (isCurrentFavorite) {
      setFavorites((prev) => prev.filter((f) => f.href !== currentFavorite.href));
    } else {
      setFavorites((prev) => [...prev, currentFavorite]);
    }
  }

  function removeFavorite(href: string) {
    setFavorites((prev) => prev.filter((f) => f.href !== href));
  }

  return (
    <div className="flex items-center gap-3 border-b border-[var(--blz-border)] bg-[var(--blz-surface)] px-4 py-2">
      <span className="mr-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--blz-text-muted)]">
        Favorites
      </span>
      <div className="flex items-center gap-2">
        {favorites.map((favorite) => (
          <TooltipIcon
            key={favorite.href}
            href={favorite.href}
            label={getFavoriteLabel(favorite.href, tNav)}
            isActive={isActive(favorite.href)}
            onRemove={() => removeFavorite(favorite.href)}
          >
            <FavoriteIcon icon={favorite.icon} />
          </TooltipIcon>
        ))}
        <TooltipIcon
          label={isCurrentFavorite ? "Remove current from favorites" : "Add current to favorites"}
          onClick={toggleCurrentFavorite}
          ariaLabel={isCurrentFavorite ? "Remove current from favorites" : "Add current to favorites"}
        >
          {isCurrentFavorite ? (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
            </svg>
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          )}
        </TooltipIcon>
      </div>
    </div>
  );
}
