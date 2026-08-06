"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getNextOpenSlots, type AvailabilityWindowResult, type AvailableSlot } from "@/lib/bookingAvailability";
import { parseSwissDate, formatSwissYmd, getSwissToday } from "@/lib/swissTimezone";

const DAY_WINDOW_SIZE = 7;

type DayAvailability = { start: string; end: string };

type WeekAvailabilityPickerProps = {
  serviceName: string;
  servicePriceLabel?: string | null;
  serviceDurationMinutes?: number | null;
  doctorName: string;
  selectedDate: string;
  selectedTime: string;
  onSelectSlot: (date: string, time: string) => void;
  availabilityWindow: { startDate: string; endDate: string; result: AvailabilityWindowResult } | null;
  generateTimeSlots: (date: string) => string[];
  getDayAvailability: (date: string) => DayAvailability | undefined;
  nextAvailableSlots: AvailableSlot[];
  isLoading: boolean;
  dateLocale: string;
  noSlotsLabel: string;
  nextAvailableLabel: string;
  checkingAvailabilityLabel: string;
  /**
   * Fetches fresh availability for an arbitrary [start, end) ISO range.
   * Used as a fallback whenever the visible week isn't fully covered by
   * the already-fetched `availabilityWindow`, e.g. after paging forward
   * past the initial lookahead — so navigation never silently shows
   * "no availability" just because nothing was ever actually checked.
   */
  onFetchWeek: (startIso: string, endIso: string) => Promise<AvailabilityWindowResult>;
};

function addDaysToYmd(ymd: string, days: number): string {
  const date = parseSwissDate(ymd);
  date.setDate(date.getDate() + days);
  return formatSwissYmd(date);
}

export default function WeekAvailabilityPicker({
  serviceName,
  servicePriceLabel,
  serviceDurationMinutes,
  doctorName,
  selectedDate,
  selectedTime,
  onSelectSlot,
  availabilityWindow,
  generateTimeSlots,
  getDayAvailability,
  nextAvailableSlots,
  isLoading,
  dateLocale,
  noSlotsLabel,
  nextAvailableLabel,
  checkingAvailabilityLabel,
  onFetchWeek,
}: WeekAvailabilityPickerProps) {
  const minDate = useMemo(() => formatSwissYmd(getSwissToday()), []);
  const WIDE_SEARCH_DAYS = 180;

  const [windowStart, setWindowStart] = useState<string>(() => selectedDate || minDate);
  // Extra availability fetched on demand for weeks that fall outside the
  // page's initial prefetch, keyed by the week's start date.
  const [fetchedWeeks, setFetchedWeeks] = useState<Record<string, AvailabilityWindowResult>>({});
  const [isFetchingWeek, setIsFetchingWeek] = useState(false);
  const fetchedWeeksRef = useRef(fetchedWeeks);
  fetchedWeeksRef.current = fetchedWeeks;

  // Broader on-demand search used as a fallback when the current week (and
  // the page's own cheap pre-scan) both come up empty, so the picker never
  // just dead-ends on an empty "today" week with no way forward.
  const [wideSearch, setWideSearch] = useState<{ start: string; end: string; result: AvailabilityWindowResult } | null>(null);
  const [isSearchingForward, setIsSearchingForward] = useState(false);
  const hasWideSearchedRef = useRef(false);

  // Auto-jump the visible week to the earliest available slot exactly once,
  // when it first becomes known (e.g. the initial "next open slot" lookup
  // resolves after mount). After that, manual week navigation is left alone
  // even if it moves away from the currently selected date.
  const hasAutoJumpedRef = useRef(false);
  useEffect(() => {
    if (hasAutoJumpedRef.current) return;
    if (!selectedDate) return;
    hasAutoJumpedRef.current = true;
    if (selectedDate < windowStart || selectedDate > addDaysToYmd(windowStart, DAY_WINDOW_SIZE - 1)) {
      setWindowStart(selectedDate);
    }
  }, [selectedDate, windowStart]);

  const weekDates = useMemo(
    () => Array.from({ length: DAY_WINDOW_SIZE }, (_, i) => addDaysToYmd(windowStart, i)),
    [windowStart],
  );
  const weekEnd = weekDates[weekDates.length - 1];

  // The prefetched window covers the visible week only if every visible
  // date falls within its [startDate, endDate] bounds. Never assume it
  // does just because *some* prefetch happened.
  const isWeekCoveredByPrefetch =
    !!availabilityWindow && windowStart >= availabilityWindow.startDate && weekEnd <= availabilityWindow.endDate;
  const isWeekCoveredByWideSearch = !!wideSearch && windowStart >= wideSearch.start && weekEnd <= wideSearch.end;
  const isWeekCovered = isWeekCoveredByPrefetch || isWeekCoveredByWideSearch;

  useEffect(() => {
    if (isWeekCovered) return;
    if (fetchedWeeksRef.current[windowStart]) return;
    let cancelled = false;
    setIsFetchingWeek(true);
    (async () => {
      try {
        const startIso = parseSwissDate(windowStart).toISOString();
        const endIso = new Date(parseSwissDate(weekEnd).getTime() + 24 * 60 * 60 * 1000).toISOString();
        const result = await onFetchWeek(startIso, endIso);
        if (cancelled) return;
        setFetchedWeeks((prev) => ({ ...prev, [windowStart]: result }));
      } catch (err) {
        console.error("Failed to fetch week availability:", err);
      } finally {
        if (!cancelled) setIsFetchingWeek(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [windowStart, weekEnd, isWeekCovered, onFetchWeek]);

  const activeResult = isWeekCoveredByPrefetch
    ? availabilityWindow?.result ?? null
    : isWeekCoveredByWideSearch
      ? wideSearch?.result ?? null
      : fetchedWeeks[windowStart] ?? null;

  const slotsByDate = useMemo(() => {
    if (!activeResult) return {} as Record<string, string[]>;
    const flat = getNextOpenSlots({
      dates: weekDates,
      availabilityWindow: activeResult,
      generateTimeSlots,
      getDayAvailability,
      limit: Number.MAX_SAFE_INTEGER,
    });
    const grouped: Record<string, string[]> = {};
    for (const slot of flat) {
      grouped[slot.date] = grouped[slot.date] ? [...grouped[slot.date], slot.time] : [slot.time];
    }
    return grouped;
  }, [weekDates, activeResult, generateTimeSlots, getDayAvailability]);

  const currentWeekHasSlots = weekDates.some((date) => slotsByDate[date]?.length);

  // If the visible week has no openings and the page's own cheap lookahead
  // scan didn't find anything nearby either, run one broader search (up to
  // ~6 months) instead of leaving the patient stuck on a dead week, and
  // jump straight to the first real opening it finds.
  useEffect(() => {
    if (hasWideSearchedRef.current) return;
    if (isLoading || isFetchingWeek || !activeResult) return;
    if (currentWeekHasSlots) return;
    if (nextAvailableSlots.length > 0) return;
    hasWideSearchedRef.current = true;
    setIsSearchingForward(true);
    (async () => {
      try {
        const searchEndDate = addDaysToYmd(windowStart, WIDE_SEARCH_DAYS);
        const startIso = parseSwissDate(windowStart).toISOString();
        const endIso = new Date(parseSwissDate(searchEndDate).getTime() + 24 * 60 * 60 * 1000).toISOString();
        const result = await onFetchWeek(startIso, endIso);
        setWideSearch({ start: windowStart, end: searchEndDate, result });
        const earliest = getNextOpenSlots({
          dates: Array.from({ length: WIDE_SEARCH_DAYS }, (_, i) => addDaysToYmd(windowStart, i)),
          availabilityWindow: result,
          generateTimeSlots,
          getDayAvailability,
          limit: 1,
        });
        if (earliest.length > 0) {
          setWindowStart(earliest[0].date);
          onSelectSlot(earliest[0].date, earliest[0].time);
        }
      } catch (err) {
        console.error("Failed wide availability search:", err);
      } finally {
        setIsSearchingForward(false);
      }
    })();
  }, [isLoading, isFetchingWeek, activeResult, currentWeekHasSlots, nextAvailableSlots, windowStart, onFetchWeek, generateTimeSlots, getDayAvailability, onSelectSlot]);

  const nextJumpSlot = useMemo(() => {
    const lastVisible = weekDates[weekDates.length - 1];
    return nextAvailableSlots.find((slot) => slot.date > lastVisible) ?? null;
  }, [nextAvailableSlots, weekDates]);

  // Block all navigation while any fetch is in flight — otherwise a click
  // during loading can land the user on a week before the "jump to
  // earliest available" logic has had a chance to run, and it never gets
  // a second chance to correct course.
  const isBusy = isLoading || isFetchingWeek || isSearchingForward;
  const canGoBack = !isBusy && (addDaysToYmd(windowStart, -DAY_WINDOW_SIZE) >= minDate || windowStart > minDate);
  const canGoForward = !isBusy;

  function goToWeek(nextStart: string) {
    if (isBusy) return;
    const clamped = nextStart < minDate ? minDate : nextStart;
    setWindowStart(clamped);
  }

  function jumpToNextAvailable() {
    if (!nextJumpSlot) return;
    setWindowStart(nextJumpSlot.date);
    onSelectSlot(nextJumpSlot.date, nextJumpSlot.time);
  }

  const weekdayFormatter = new Intl.DateTimeFormat(dateLocale, { weekday: "long", timeZone: "Europe/Zurich" });
  const dayMonthFormatter = new Intl.DateTimeFormat(dateLocale, { day: "numeric", month: "short", timeZone: "Europe/Zurich" });
  const headerFormatter = new Intl.DateTimeFormat(dateLocale, { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Zurich" });

  return (
    <div className="rounded-2xl bg-[#1b2130] p-3 sm:p-5 text-slate-200">
      {/* Treatment summary */}
      <div className="rounded-xl bg-[#252c3d] p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-white">{serviceName}</p>
            {(servicePriceLabel || serviceDurationMinutes) && (
              <p className="text-xs text-slate-400">
                {servicePriceLabel}
                {servicePriceLabel && serviceDurationMinutes ? " / " : ""}
                {serviceDurationMinutes ? `${serviceDurationMinutes} min` : ""}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Practitioner row */}
      <div className="mt-2 flex items-center gap-2 rounded-xl bg-[#252c3d] px-4 py-3 text-sm text-slate-300">
        <svg className="h-4 w-4 flex-shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 20a6 6 0 0 1 8-5.29A6 6 0 0 1 20 20" />
        </svg>
        <span>{doctorName}</span>
      </div>

      {/* Week navigator */}
      <div className="mt-4 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => goToWeek(addDaysToYmd(windowStart, -DAY_WINDOW_SIZE))}
          disabled={!canGoBack}
          aria-label="Previous week"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-[#252c3d] text-slate-300 transition-colors hover:bg-[#2f3750] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="rounded-full bg-[#252c3d] px-4 py-1.5 text-sm font-medium text-white">
          {headerFormatter.format(parseSwissDate(windowStart))}
        </span>
        <button
          type="button"
          onClick={() => goToWeek(addDaysToYmd(windowStart, DAY_WINDOW_SIZE))}
          disabled={!canGoForward}
          aria-label="Next week"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-[#252c3d] text-slate-300 transition-colors hover:bg-[#2f3750] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Day columns */}
      {isBusy ? (
        <div className="mt-5 flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
          <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-slate-400" />
          {checkingAvailabilityLabel}
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-4 gap-2 sm:grid-cols-7 sm:gap-2.5">
          {weekDates.map((date, idx) => {
            const isToday = date === minDate;
            const times = slotsByDate[date] || [];
            const isLastColumn = idx === weekDates.length - 1;
            return (
              <div key={date} className="min-w-0">
                <div className="mb-2 text-center">
                  <p className="truncate text-[11px] font-medium text-slate-400 sm:text-xs">
                    {isToday ? "Aujourd'hui" : weekdayFormatter.format(parseSwissDate(date))}
                  </p>
                  <p className="text-[11px] text-slate-500 sm:text-xs">{dayMonthFormatter.format(parseSwissDate(date))}</p>
                </div>
                <div className="space-y-1.5">
                  {times.length > 0 ? (
                    times.map((time) => {
                      const isSelected = selectedDate === date && selectedTime === time;
                      return (
                        <button
                          key={time}
                          type="button"
                          onClick={() => onSelectSlot(date, time)}
                          aria-pressed={isSelected}
                          className={`flex w-full items-center justify-center gap-1 rounded-lg px-1.5 py-1.5 text-center text-[11px] font-semibold transition-all sm:text-xs ${
                            isSelected
                              ? "bg-emerald-400 text-[#0f2a20] shadow-[0_0_0_2px_rgba(52,211,153,0.35)] ring-2 ring-emerald-300 scale-[1.04]"
                              : "bg-[#e7e6e2] text-[#1b2130] font-medium hover:bg-white"
                          }`}
                        >
                          {isSelected && (
                            <svg className="h-3 w-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                          {time}
                        </button>
                      );
                    })
                  ) : (
                    <div className="text-center">
                      <p className="text-[10px] leading-tight text-slate-500 sm:text-[11px]">{noSlotsLabel}</p>
                      {isLastColumn && nextJumpSlot && (
                        <button
                          type="button"
                          onClick={jumpToNextAvailable}
                          className="mt-2 w-full rounded-lg bg-[#252c3d] px-1.5 py-1.5 text-[10px] font-medium text-slate-200 transition-colors hover:bg-[#2f3750] sm:text-[11px]"
                        >
                          » {nextAvailableLabel}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
