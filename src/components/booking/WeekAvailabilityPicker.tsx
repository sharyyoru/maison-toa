"use client";

import { useMemo, useState } from "react";
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
}: WeekAvailabilityPickerProps) {
  const minDate = useMemo(() => formatSwissYmd(getSwissToday()), []);
  const maxDate = availabilityWindow?.endDate ?? null;

  const [windowStart, setWindowStart] = useState<string>(() => selectedDate || minDate);

  // Keep the visible week aligned to whatever date is currently selected,
  // e.g. after "jump to next availability" picks a far-future date.
  const effectiveWindowStart =
    selectedDate && (selectedDate < windowStart || selectedDate > addDaysToYmd(windowStart, DAY_WINDOW_SIZE - 1))
      ? selectedDate
      : windowStart;

  const weekDates = useMemo(
    () => Array.from({ length: DAY_WINDOW_SIZE }, (_, i) => addDaysToYmd(effectiveWindowStart, i)),
    [effectiveWindowStart],
  );

  const slotsByDate = useMemo(() => {
    if (!availabilityWindow) return {} as Record<string, string[]>;
    const flat = getNextOpenSlots({
      dates: weekDates,
      availabilityWindow: availabilityWindow.result,
      generateTimeSlots,
      getDayAvailability,
      limit: Number.MAX_SAFE_INTEGER,
    });
    const grouped: Record<string, string[]> = {};
    for (const slot of flat) {
      grouped[slot.date] = grouped[slot.date] ? [...grouped[slot.date], slot.time] : [slot.time];
    }
    return grouped;
  }, [weekDates, availabilityWindow, generateTimeSlots, getDayAvailability]);

  const nextJumpSlot = useMemo(() => {
    const lastVisible = weekDates[weekDates.length - 1];
    return nextAvailableSlots.find((slot) => slot.date > lastVisible) ?? null;
  }, [nextAvailableSlots, weekDates]);

  const canGoBack = addDaysToYmd(effectiveWindowStart, -DAY_WINDOW_SIZE) >= minDate || effectiveWindowStart > minDate;
  const canGoForward = !maxDate || addDaysToYmd(effectiveWindowStart, DAY_WINDOW_SIZE) <= maxDate || weekDates.some((d) => slotsByDate[d]?.length);

  function goToWeek(nextStart: string) {
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
          onClick={() => goToWeek(addDaysToYmd(effectiveWindowStart, -DAY_WINDOW_SIZE))}
          disabled={!canGoBack}
          aria-label="Previous week"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-[#252c3d] text-slate-300 transition-colors hover:bg-[#2f3750] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="rounded-full bg-[#252c3d] px-4 py-1.5 text-sm font-medium text-white">
          {headerFormatter.format(parseSwissDate(effectiveWindowStart))}
        </span>
        <button
          type="button"
          onClick={() => goToWeek(addDaysToYmd(effectiveWindowStart, DAY_WINDOW_SIZE))}
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
      {isLoading ? (
        <div className="mt-5 flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
          <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-slate-400" />
          Chargement...
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-7 gap-1.5 sm:gap-2.5 overflow-x-auto">
          {weekDates.map((date, idx) => {
            const isToday = date === minDate;
            const times = slotsByDate[date] || [];
            const isLastColumn = idx === weekDates.length - 1;
            return (
              <div key={date} className="min-w-[68px] sm:min-w-[92px]">
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
                          className={`w-full rounded-lg px-1.5 py-1.5 text-center text-[11px] font-medium transition-colors sm:text-xs ${
                            isSelected
                              ? "bg-white text-[#1b2130]"
                              : "bg-[#e7e6e2] text-[#1b2130] hover:bg-white"
                          }`}
                        >
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
