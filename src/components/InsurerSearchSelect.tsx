"use client";

import { useState, useEffect, useRef } from "react";
import { supabaseClient } from "@/lib/supabaseClient";

type InsurerSearchSelectProps = {
  value: string;
  onChange: (gln: string, name?: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
};

export default function InsurerSearchSelect({
  value,
  onChange,
  placeholder = "Search insurer...",
  className = "",
  inputClassName = "",
}: InsurerSearchSelectProps) {
  const [inputValue, setInputValue] = useState(value || "");
  const [options, setOptions] = useState<{ gln: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const fetchedValueRef = useRef<string>("");

  // Initial fetch to get name for the current value
  useEffect(() => {
    if (value && value !== fetchedValueRef.current) {
      if (!inputValue || inputValue === value) {
        setInputValue(value);
      }

      supabaseClient
        .from("swiss_insurers")
        .select("name, gln")
        .eq("gln", value)
        .maybeSingle()
        .then(({ data, error }) => {
          if (data) {
            const displayName = `${data.name} (${data.gln})`;
            setInputValue(displayName);
            fetchedValueRef.current = value;
          } else {
            console.warn("Could not find insurer name for GLN:", value, error);
            setInputValue(value);
            fetchedValueRef.current = value;
          }
        });
    } else if (!value) {
      setInputValue("");
      fetchedValueRef.current = "";
    }
  }, [value]);

  // Handle outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Search insurers
  const searchInsurers = async (search: string) => {
    setLoading(true);
    try {
      let query = supabaseClient
        .from("swiss_insurers")
        .select("name, gln")
        .order("name")
        .limit(15);

      if (search) {
        if (/^\d+$/.test(search)) {
          query = query.like("gln", `%${search}%`);
        } else {
          query = query.or(`name.ilike.%${search}%,gln.ilike.%${search}%`);
        }
      }

      const { data } = await query;
      setOptions(data || []);
    } catch (error) {
      console.error("Error searching insurers:", error);
    } finally {
      setLoading(false);
    }
  };

  // Debounce search
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        if (value && inputValue.includes(value)) {
          return;
        }
        searchInsurers(inputValue);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [inputValue, isOpen, value]);

  const defaultInputClass =
    "w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";

  return (
    <div className={`relative ${className}`} ref={wrapperRef}>
      <div className="relative">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            const newValue = e.target.value;
            setInputValue(newValue);
            setIsOpen(true);

            if (value) {
              onChange("", "");
              fetchedValueRef.current = "";
            }
          }}
          onFocus={() => {
            setIsOpen(true);
            const isDisplayingSelection = value && inputValue.includes(value);
            searchInsurers(isDisplayingSelection ? "" : inputValue);
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
              fetchedValueRef.current = "";
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
        <div className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {loading ? (
            <div className="px-3 py-2 text-xs text-slate-500">Loading...</div>
          ) : options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500">No results found</div>
          ) : (
            options.map((option) => (
              <button
                key={option.gln}
                type="button"
                onClick={() => {
                  onChange(option.gln, option.name);
                  setInputValue(`${option.name} (${option.gln})`);
                  fetchedValueRef.current = option.gln;
                  setIsOpen(false);
                }}
                className="w-full px-3 py-2 text-left hover:bg-sky-50"
              >
                <div className="text-xs font-medium text-slate-900">{option.name}</div>
                <div className="text-[10px] text-slate-500">GLN: {option.gln}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
