"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/AuthContext";
import { usePatientTabs } from "@/components/PatientTabsContext";
import { PATIENT_COLOR } from "@/lib/patientColor";
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
  "/online-bookings": { icon: "onlineBookings", labelKey: "onlineBookings" },
  "/cms/book-appointment": { icon: "bookAppointmentCms", labelKey: "bookAppointmentCms" },
  "/deals": { icon: "deals", labelKey: "dealsAndPipeline" },
  "/financials": { icon: "financials", labelKey: "financials" },
  "/invoices": { icon: "invoices", labelKey: "invoices" },
  "/deposits": { icon: "deposits", label: "Acomptes 50%" },
  "/medidata": { icon: "medidata", labelKey: "medidata" },
  "/services": { icon: "services", labelKey: "services" },
  "/tasks": { icon: "tasks", labelKey: "tasks" },
  "/users": { icon: "users", labelKey: "userManagement" },
  "/workflows": { icon: "workflows", labelKey: "workflows" },
  "/workflows/templates": { icon: "workflows", labelKey: "templates" },
  "/controllers": { icon: "controllers", labelKey: "controllers" },
  "/email-reports": { icon: "emailReports", labelKey: "emailReports" },
  "/chat": { icon: "chat", labelKey: "chatWithAliice" },
  "/client-onboarding": { icon: "clientOnboarding", labelKey: "clientOnboarding" },
  "/settings": { icon: "settings", labelKey: "settings" },
  "/search": { icon: "search", label: "Search" },
};

// Full catalog of pages offered in the "Add to favorites" picker, in the
// same order as the classic sidebar so it feels familiar.
const ALL_PAGES: Favorite[] = [
  { href: "/", icon: "home" },
  { href: "/patients", icon: "patients" },
  { href: "/appointments", icon: "calendar" },
  { href: "/online-bookings", icon: "onlineBookings" },
  { href: "/cms/book-appointment", icon: "bookAppointmentCms" },
  { href: "/deals", icon: "deals" },
  { href: "/financials", icon: "financials" },
  { href: "/invoices", icon: "invoices" },
  { href: "/deposits", icon: "deposits" },
  { href: "/medidata", icon: "medidata" },
  { href: "/services", icon: "services" },
  { href: "/tasks", icon: "tasks" },
  { href: "/users", icon: "users" },
  { href: "/workflows", icon: "workflows" },
  { href: "/workflows/templates", icon: "workflows" },
  { href: "/controllers", icon: "controllers" },
  { href: "/email-reports", icon: "emailReports" },
  { href: "/chat", icon: "chat" },
  { href: "/client-onboarding", icon: "clientOnboarding" },
  { href: "/settings", icon: "settings" },
  { href: "/search", icon: "search" },
];

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

async function seedFavoritesInDb(userId: string, favorites: Favorite[]) {
  const rows = favorites.map((f, i) => ({
    user_id: userId,
    href: f.href,
    icon: f.icon,
    sort_order: i,
  }));
  if (rows.length > 0) {
    const { error } = await supabaseClient
      .from("favorites")
      .upsert(rows, { onConflict: "user_id,href" });
    if (error) console.error("Failed to seed favorites:", error);
  }
}

async function addFavoriteToDb(userId: string, favorite: Favorite, sortOrder: number) {
  const { error } = await supabaseClient.from("favorites").upsert({
    user_id: userId,
    href: favorite.href,
    icon: favorite.icon,
    sort_order: sortOrder,
  }, { onConflict: "user_id,href" });
  if (error) console.error("Failed to add favorite:", error);
}

async function removeFavoriteFromDb(userId: string, href: string) {
  const { error } = await supabaseClient
    .from("favorites")
    .delete()
    .eq("user_id", userId)
    .eq("href", href);
  if (error) console.error("Failed to remove favorite:", error);
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
    case "onlineBookings":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3c-2.5 3-4 5.5-4 9s1.5 6 4 9" />
          <path d="M12 3c2.5 3 4 5.5 4 9s-1.5 6-4 9" />
          <path d="M3 12h18" />
        </svg>
      );
    case "bookAppointmentCms":
      return (
        <svg {...props}>
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
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
    case "invoices":
      return (
        <svg {...props}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="M8 13h8M8 17h8" />
        </svg>
      );
    case "deposits":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4l2 2" />
        </svg>
      );
    case "medidata":
      return (
        <svg {...props}>
          <path d="M9 12l2 2 4-4" />
          <path d="M12 3c7.2 0 9 1.8 9 9s-1.8 9-9 9-9-1.8-9-9 1.8-9 9-9z" />
        </svg>
      );
    case "services":
      return (
        <svg {...props}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M7 9h10M7 13h6M7 17h3" />
        </svg>
      );
    case "tasks":
      return (
        <svg {...props}>
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      );
    case "users":
      return (
        <svg {...props}>
          <path d="M9 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3Z" />
          <path d="M17 11a3 3 0 1 0-3-3" />
          <path d="M3 20a4 4 0 0 1 8 0" />
          <path d="M13 20a4 4 0 0 1 8 0" />
        </svg>
      );
    case "workflows":
      return (
        <svg {...props}>
          <path d="M3 3h6v6H3zM9 9h6v6H9zM15 15h6v6h-6z" />
          <path d="M6 9v3a3 3 0 0 0 3 3h3M12 15v3a3 3 0 0 0 3 3h3" />
        </svg>
      );
    case "controllers":
      return (
        <svg {...props}>
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        </svg>
      );
    case "emailReports":
      return (
        <svg {...props}>
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <path d="M22 6 12 13 2 6" />
        </svg>
      );
    case "chat":
      return (
        <svg {...props}>
          <path d="M4 6h16v9H8l-4 3z" />
          <path d="M8 10h8M8 13h5" />
        </svg>
      );
    case "clientOnboarding":
      return (
        <svg {...props}>
          <path d="M13.828 10.172a4 4 0 0 0-5.656 0l-4 4a4 4 0 1 0 5.656 5.656l1.102-1.101" />
          <path d="M10.172 13.828a4 4 0 0 0 5.656 0l4-4a4 4 0 1 0-5.656-5.656l-1.1 1.1" />
        </svg>
      );
    case "settings":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
    case "search":
      return (
        <svg className={className ?? "h-4.5 w-4.5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
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
  ariaLabel,
  children,
}: {
  href?: string;
  label: string;
  isActive?: boolean;
  onClick?: () => void;
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
    </div>
  );
}

function EditFavoritesModal({
  favorites,
  tNav,
  onAdd,
  onRemove,
  onClose,
}: {
  favorites: Favorite[];
  tNav: (key: string) => string;
  onAdd: (page: Favorite) => void;
  onRemove: (href: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const favoriteHrefs = new Set(favorites.map((f) => f.href));
  const availablePages = ALL_PAGES.filter((page) => !favoriteHrefs.has(page.href)).filter(
    (page) => getFavoriteLabel(page.href, tNav).toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--blz-border)] bg-[var(--blz-surface-elevated)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--blz-border)] px-5 py-3.5">
          <h2 className="text-sm font-semibold text-[var(--blz-text-primary)]">Edit Favorites</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1.5 text-xs font-semibold text-sky-500 hover:bg-sky-500/10"
          >
            Done
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Your favorites — remove from here, like removing an app icon */}
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--blz-text-muted)]">
            Your Favorites
          </p>
          {favorites.length === 0 ? (
            <p className="mb-5 text-xs text-[var(--blz-text-muted)]">
              No favorites yet — add pages from the list below.
            </p>
          ) : (
            <div className="mb-5 grid grid-cols-3 gap-3 sm:grid-cols-4">
              {favorites.map((favorite) => (
                <div key={favorite.href} className="relative flex flex-col items-center gap-1.5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--blz-border)] bg-[var(--blz-surface)] text-[var(--blz-text-secondary)]">
                    <FavoriteIcon icon={favorite.icon} />
                  </div>
                  <span className="w-full truncate text-center text-[10px] text-[var(--blz-text-secondary)]">
                    {getFavoriteLabel(favorite.href, tNav)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemove(favorite.href)}
                    className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-500 text-[11px] font-bold leading-none text-white shadow-sm hover:bg-red-500"
                    aria-label={`Remove ${getFavoriteLabel(favorite.href, tNav)} from favorites`}
                  >
                    −
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="my-4 border-t border-[var(--blz-border)]" />

          {/* All pages — add from here, like installing an app */}
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--blz-text-muted)]">
              All Pages
            </p>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-32 rounded-md border border-[var(--blz-border)] bg-[var(--blz-surface)] px-2 py-1 text-[11px] text-[var(--blz-text-primary)] placeholder:text-[var(--blz-text-muted)] focus:border-sky-400 focus:outline-none"
            />
          </div>
          {availablePages.length === 0 ? (
            <p className="text-xs text-[var(--blz-text-muted)]">
              {search ? "No matching pages." : "All pages are already in your favorites."}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {availablePages.map((page) => (
                <div key={page.href} className="relative flex flex-col items-center gap-1.5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--blz-border)] bg-[var(--blz-surface)] text-[var(--blz-text-secondary)]">
                    <FavoriteIcon icon={page.icon} />
                  </div>
                  <span className="w-full truncate text-center text-[10px] text-[var(--blz-text-secondary)]">
                    {getFavoriteLabel(page.href, tNav)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onAdd(page)}
                    className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-bold leading-none text-white shadow-sm hover:bg-emerald-600"
                    aria-label={`Add ${getFavoriteLabel(page.href, tNav)} to favorites`}
                  >
                    +
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FavoritesBar() {
  const pathname = usePathname();
  const router = useRouter();
  const tNav = useTranslations("nav");
  const { user, loading } = useAuth();
  const { tabs, activePatientId, removeTab, clearAllTabs } = usePatientTabs();
  const [favorites, setFavorites] = useState<Favorite[]>(DEFAULT_FAVORITES);
  const [loaded, setLoaded] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [patientTabsOverflow, setPatientTabsOverflow] = useState({ left: false, right: false });
  const patientTabsRef = useRef<HTMLDivElement>(null);
  const openPatients = tabs;

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
        await seedFavoritesInDb(user.id, DEFAULT_FAVORITES);
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

  const isActive = useCallback(
    (href: string) => {
      if (href === "/") return pathname === "/";
      return pathname.startsWith(href);
    },
    [pathname]
  );

  function addFavorite(page: Favorite) {
    if (favorites.some((favorite) => favorite.href === page.href)) return;
    if (user) void addFavoriteToDb(user.id, page, favorites.length);
    setFavorites((prev) => {
      if (prev.some((f) => f.href === page.href)) return prev;
      return [...prev, page];
    });
  }

  function removeFavorite(href: string) {
    setFavorites((prev) => prev.filter((f) => f.href !== href));
    if (user) void removeFavoriteFromDb(user.id, href);
  }

  function closePatient(patientId: string) {
    const tabIndex = tabs.findIndex((tab) => tab.id === patientId);
    const nextPatient = tabs[tabIndex - 1] ?? tabs[tabIndex + 1] ?? null;
    removeTab(patientId);

    if (patientId === activePatientId) {
      router.push(nextPatient ? `/patients/${nextPatient.id}` : "/patients");
    }
  }

  function closeAllPatients() {
    clearAllTabs();
    if (activePatientId) router.push("/patients");
  }

  const updatePatientTabsOverflow = useCallback(() => {
    const element = patientTabsRef.current;
    if (!element) return;

    setPatientTabsOverflow({
      left: element.scrollLeft > 1,
      right: element.scrollLeft + element.clientWidth < element.scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    const element = patientTabsRef.current;
    if (!element) return;

    updatePatientTabsOverflow();
    const resizeObserver = new ResizeObserver(updatePatientTabsOverflow);
    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, [openPatients, updatePatientTabsOverflow]);

  function scrollPatientTabs(direction: -1 | 1) {
    patientTabsRef.current?.scrollBy({
      left: direction * Math.max(220, patientTabsRef.current.clientWidth * 0.65),
      behavior: "smooth",
    });
  }

  return (
    <div className="border-b border-[var(--blz-border)] bg-[var(--blz-surface)]">
      {openPatients.length > 0 && (
        <div className="flex min-w-0 items-center gap-3 border-b border-[var(--blz-border)] px-4 py-2">
          <span className="mr-2 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-[var(--blz-text-muted)]">
            Open patients
          </span>
          <button
            type="button"
            onClick={closeAllPatients}
            className="shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold text-[var(--blz-text-secondary)] transition hover:bg-red-50 hover:text-red-600"
            title="Close all open patient files"
          >
            Clear All
          </button>
          <button
            type="button"
            onClick={() => scrollPatientTabs(-1)}
            disabled={!patientTabsOverflow.left}
            aria-label="Show previously visible patient files"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--blz-border)] text-[var(--blz-text-secondary)] transition hover:bg-[var(--blz-hover)] disabled:cursor-default disabled:opacity-30"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <div
            ref={patientTabsRef}
            onScroll={updatePatientTabsOverflow}
            className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-0.5"
          >
            {openPatients.map((patient) => {
              const patientName =
                [patient.lastName?.trim(), patient.firstName?.trim()].filter(Boolean).join(" ") ||
                "Unknown patient";
              const isCurrentPatient = patient.id === activePatientId;

              return (
                <div
                  key={patient.id}
                  className={`inline-flex shrink-0 items-center rounded-full border text-xs font-medium transition-all ${isCurrentPatient ? PATIENT_COLOR.active : PATIENT_COLOR.inactive}`}
                  aria-current={isCurrentPatient ? "page" : undefined}
                  style={isCurrentPatient ? undefined : { backgroundColor: "#EAEEF4" }}
                >
                  <Link
                    href={`/patients/${patient.id}`}
                    title={`Open patient file: ${patientName}`}
                    className="inline-flex min-w-0 items-center gap-2 py-1 pl-2.5 pr-1"
                  >
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white ${isCurrentPatient ? PATIENT_COLOR.activeAvatar : PATIENT_COLOR.avatar}`}>
                      {`${patient.firstName?.[0] ?? ""}${patient.lastName?.[0] ?? ""}`.toUpperCase() || "?"}
                    </span>
                    <span className="max-w-48 truncate">{patientName}</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => closePatient(patient.id)}
                    aria-label={`Close patient file: ${patientName}`}
                    title={`Close ${patientName}`}
                    className="mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full opacity-50 transition hover:bg-black/10 hover:opacity-100"
                  >
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                      <path d="M6 6l12 12M18 6 6 18" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => scrollPatientTabs(1)}
            disabled={!patientTabsOverflow.right}
            aria-label="Show earlier opened patient files"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--blz-border)] text-[var(--blz-text-secondary)] transition hover:bg-[var(--blz-hover)] disabled:cursor-default disabled:opacity-30"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>
      )}

      <div className="flex items-center gap-3 px-4 py-2">
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
          >
            <FavoriteIcon icon={favorite.icon} />
          </TooltipIcon>
        ))}
      </div>

      {/* Small, deliberate edit trigger — separated from the favorite icons
          so it doesn't compete with them or get triggered by accident. */}
      <button
        type="button"
        onClick={() => setIsEditModalOpen(true)}
        aria-label="Edit favorites"
        title="Edit favorites"
        className="ml-1 flex h-5 w-5 items-center justify-center rounded text-[var(--blz-text-muted)] opacity-60 transition-opacity hover:opacity-100 hover:text-sky-500"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z" />
        </svg>
      </button>
      </div>

      {isEditModalOpen && (
        <EditFavoritesModal
          favorites={favorites}
          tNav={tNav}
          onAdd={addFavorite}
          onRemove={removeFavorite}
          onClose={() => setIsEditModalOpen(false)}
        />
      )}
    </div>
  );
}
