import type { CSSProperties } from "react";

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const LEGACY_BACKGROUND_CLASS_PATTERN = /^bg-[a-z]+-\d{2,3}(?:\/\d{1,3})?$/;

const LEGACY_CATEGORY_COLOR_HEX: Record<string, string> = {
  "bg-slate-300/70": "#cbd5e1",
  "bg-gray-300/70": "#d1d5db",
  "bg-red-300/70": "#fca5a5",
  "bg-orange-300/70": "#fdba74",
  "bg-amber-300/70": "#fcd34d",
  "bg-yellow-300/70": "#fde047",
  "bg-lime-300/70": "#bef264",
  "bg-green-300/70": "#86efac",
  "bg-emerald-300/70": "#6ee7b7",
  "bg-teal-300/70": "#5eead4",
  "bg-cyan-300/70": "#67e8f9",
  "bg-sky-300/70": "#7dd3fc",
  "bg-blue-300/70": "#93c5fd",
  "bg-indigo-300/70": "#a5b4fc",
  "bg-violet-300/70": "#c4b5fd",
  "bg-purple-300/70": "#d8b4fe",
  "bg-fuchsia-300/70": "#f0abfc",
  "bg-pink-300/70": "#f9a8d4",
  "bg-rose-300/70": "#fda4af",
};

export type CategoryColorPresentation = {
  className: string;
  style?: CSSProperties;
};

export function categoryColorToPickerHex(color: string | null | undefined): string {
  if (!color) return "#ffffff";
  if (HEX_COLOR_PATTERN.test(color)) return color.toLowerCase();
  return LEGACY_CATEGORY_COLOR_HEX[color] ?? "#ffffff";
}

export function getCategoryColorPresentation(
  color: string | null | undefined,
  fallbackClassName = "",
): CategoryColorPresentation {
  if (color && HEX_COLOR_PATTERN.test(color)) {
    return { className: "", style: { backgroundColor: color } };
  }

  if (color && LEGACY_BACKGROUND_CLASS_PATTERN.test(color)) {
    return { className: color };
  }

  return { className: fallbackClassName };
}
