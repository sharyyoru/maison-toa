"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export type MedidataParticipant = {
  glnParticipant: string;
  glnReceiver: string;
  name: string;
  street?: string;
  zipCode?: string;
  town?: string;
  lawTypes: number[];
  bagNumber?: string | null;
  tgTpChange?: boolean;
  tgAllowed?: boolean;
};

type MedidataInsurerSearchProps = {
  value: string; // GLN
  displayName?: string; // Pre-filled name to show
  onChange: (gln: string, name: string, participant?: MedidataParticipant) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
};

export default function MedidataInsurerSearch({
  value,
  displayName,
  onChange,
  placeholder = "Search insurer by name or GLN...",
  className = "",
  inputClassName = "",
}: MedidataInsurerSearchProps) {
  const [inputValue, setInputValue] = useState("");
  const [options, setOptions] = useState<MedidataParticipant[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  // Set initial display value
  useEffect(() => {
    if (displayName && value) {
      setInputValue(`${displayName} (${value})`);
      initializedRef.current = true;
    } else if (value && !initializedRef.current) {
      setInputValue(value);
    } else if (!value) {
      setInputValue("");
      initializedRef.current = false;
    }
  }, [value, displayName]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Search medidata participants via proxy
  const searchParticipants = useCallback(async (search: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "20");
      if (search) {
        if (/^\d+$/.test(search)) {
          params.set("glnparticipant", search);
        } else {
          params.set("name", search);
        }
      }

      const res = await fetch(`/api/medidata/proxy-participants?${params.toString()}`);
      const json = await res.json();

      if (json.success && Array.isArray(json.participants)) {
        setOptions(json.participants);
      } else {
        setOptions([]);
      }
    } catch (err) {
      console.error("Error searching medidata participants:", err);
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (!isOpen) return;
    const isDisplayingSelection = value && inputValue.includes(value);
    const timer = setTimeout(() => {
      if (isDisplayingSelection) return;
      searchParticipants(inputValue);
    }, 350);
    return () => clearTimeout(timer);
  }, [inputValue, isOpen, value, searchParticipants]);

  const LAW_LABELS: Record<number, string> = { 1: "KVG", 2: "UVG", 3: "IVG", 4: "MVG", 5: "VVG" };

  const defaultInputClass =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";

  return (
    <div className={`relative ${className}`} ref={wrapperRef}>
      <div className="relative">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setIsOpen(true);
            if (value) {
              onChange("", "");
              initializedRef.current = false;
            }
          }}
          onFocus={() => {
            setIsOpen(true);
            const isDisplayingSelection = value && inputValue.includes(value);
            searchParticipants(isDisplayingSelection ? "" : inputValue);
          }}
          placeholder={placeholder}
          className={inputClassName || defaultInputClass}
        />
        {inputValue && (
          <button
            type="button"
            onClick={() => {
              onChange("", "");
              setInputValue("");
              initializedRef.current = false;
              setIsOpen(false);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {loading ? (
            <div className="px-3 py-2 text-xs text-slate-500">Searching MediData participants...</div>
          ) : options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500">No participants found</div>
          ) : (
            options.map((p) => (
              <button
                key={p.glnParticipant}
                type="button"
                onClick={() => {
                  onChange(p.glnParticipant, p.name, p);
                  setInputValue(`${p.name} (${p.glnParticipant})`);
                  initializedRef.current = true;
                  setIsOpen(false);
                }}
                className="w-full px-3 py-2 text-left hover:bg-sky-50"
              >
                <div className="text-xs font-medium text-slate-900">{p.name}</div>
                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                  <span>GLN: {p.glnParticipant}</span>
                  {p.town && <span>• {p.zipCode} {p.town}</span>}
                  {p.lawTypes?.length > 0 && (
                    <span className="ml-auto text-[9px] text-slate-400">
                      {p.lawTypes.map((lt) => LAW_LABELS[lt] || lt).join(", ")}
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
