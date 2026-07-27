"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDaysToDateOnly, compareDateOnly, getProjectLocalDate, isDateOnly, listDateOnlyRange, parseDateOnly } from "@/lib/projectDateTime";

type Props = {
  selectedDates: string[];
  onChange: (dates: string[]) => void;
  startDate?: string | null;
  dueDate?: string | null;
  timeZone: string;
  disabled?: boolean;
  minDate?: string | null;
  maxDate?: string | null;
  maxSelectedDates?: number;
  resetDates?: string[];
  resetLabel?: string;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad = (value: number) => String(value).padStart(2, "0");
const fromUtcDate = (date: Date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

function monthStart(value: string) {
  const parts = parseDateOnly(value);
  if (!parts) return value;
  return `${parts.year}-${pad(parts.month)}-01`;
}

function moveMonth(value: string, amount: number) {
  const parts = parseDateOnly(value);
  if (!parts) return value;
  return fromUtcDate(new Date(Date.UTC(parts.year, parts.month - 1 + amount, 1)));
}

function monthLabel(value: string) {
  const parts = parseDateOnly(value);
  if (!parts) return "";
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(parts.year, parts.month - 1, 1)));
}

export default function TaskWorkingDatesCalendar({
  selectedDates,
  onChange,
  startDate,
  dueDate,
  timeZone,
  disabled = false,
  minDate,
  maxDate,
  maxSelectedDates = 366,
  resetDates,
  resetLabel = "Reset selection",
}: Props) {
  const today = getProjectLocalDate(timeZone);
  const normalized = useMemo(() => [...new Set(selectedDates.filter(isDateOnly))].sort(), [selectedDates]);
  const [visibleMonth, setVisibleMonth] = useState(() => monthStart(normalized[0] ?? startDate ?? today));
  const [focusedDate, setFocusedDate] = useState(() => normalized[0] ?? startDate ?? today);
  const [anchorDate, setAnchorDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const calendarId = useId();
  const dayRefs = useRef(new Map<string, HTMLButtonElement>());

  const cells = useMemo(() => {
    const parts = parseDateOnly(visibleMonth);
    if (!parts) return [];
    const first = new Date(Date.UTC(parts.year, parts.month - 1, 1));
    return Array.from({ length: 42 }, (_, index) => fromUtcDate(
      new Date(Date.UTC(parts.year, parts.month - 1, index + 1 - first.getUTCDay())),
    ));
  }, [visibleMonth]);

  useEffect(() => {
    if (!cells.includes(focusedDate)) return;
    dayRefs.current.get(focusedDate)?.focus();
  }, [cells, focusedDate]);

  const isDisabledDate = (date: string) =>
    disabled
    || Boolean(minDate && compareDateOnly(date, minDate) < 0)
    || Boolean(maxDate && compareDateOnly(date, maxDate) > 0);

  const commit = (dates: Iterable<string>) => {
    const next = [...new Set(dates)].sort();
    if (next.length > maxSelectedDates) {
      setError(`Select no more than ${maxSelectedDates} working dates.`);
      return;
    }
    setError(null);
    onChange(next);
  };

  const selectDate = (date: string, shiftKey: boolean, toggleOnly = false) => {
    if (isDisabledDate(date)) return;
    const selected = new Set(normalized);
    try {
      if (shiftKey && !toggleOnly && anchorDate) {
        const [from, to] = compareDateOnly(anchorDate, date) <= 0 ? [anchorDate, date] : [date, anchorDate];
        listDateOnlyRange(from, to, maxSelectedDates).forEach((item) => {
          if (!isDisabledDate(item)) selected.add(item);
        });
      } else if (selected.has(date)) {
        selected.delete(date);
      } else {
        selected.add(date);
      }
      if (!shiftKey || toggleOnly) setAnchorDate(date);
      setFocusedDate(date);
      setVisibleMonth(monthStart(date));
      commit(selected);
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : "Unable to select that range.");
    }
  };

  const moveFocus = (date: string, shiftKey: boolean) => {
    setFocusedDate(date);
    setVisibleMonth(monthStart(date));
    if (shiftKey) selectDate(date, true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, date: string) => {
    let target: string | null = null;
    if (event.key === "ArrowLeft") target = addDaysToDateOnly(date, -1);
    if (event.key === "ArrowRight") target = addDaysToDateOnly(date, 1);
    if (event.key === "ArrowUp") target = addDaysToDateOnly(date, -7);
    if (event.key === "ArrowDown") target = addDaysToDateOnly(date, 7);
    if (event.key === "Home") target = addDaysToDateOnly(date, -new Date(`${date}T00:00:00Z`).getUTCDay());
    if (event.key === "End") target = addDaysToDateOnly(date, 6 - new Date(`${date}T00:00:00Z`).getUTCDay());
    if (event.key === "PageUp") target = moveMonth(date, -1);
    if (event.key === "PageDown") target = moveMonth(date, 1);
    if (target) {
      event.preventDefault();
      moveFocus(target, event.shiftKey);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectDate(date, event.shiftKey);
    }
  };

  const reset = () => {
    try {
      const dates = resetDates?.length ? resetDates : [today];
      commit(dates);
      setAnchorDate(dates[0]);
      setVisibleMonth(monthStart(dates[0]));
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Unable to reset dates.");
    }
  };

  const visibleParts = parseDateOnly(visibleMonth);
  const visibleMonthKey = visibleParts ? `${visibleParts.year}-${pad(visibleParts.month)}` : "";
  const selected = new Set(normalized);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button type="button" aria-label="Previous month" onClick={() => setVisibleMonth(moveMonth(visibleMonth, -1))} disabled={disabled} className="rounded-md p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40">
          <ChevronLeft size={16} />
        </button>
        <p className="text-sm font-semibold text-slate-800">{monthLabel(visibleMonth)}</p>
        <button type="button" aria-label="Next month" onClick={() => setVisibleMonth(moveMonth(visibleMonth, 1))} disabled={disabled} className="rounded-md p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40">
          <ChevronRight size={16} />
        </button>
      </div>
      <div role="grid" aria-label="Working dates calendar" className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((day) => <div key={day} role="columnheader" className="py-1 text-center text-[10px] font-semibold uppercase text-slate-400">{day}</div>)}
        {cells.map((date) => {
          const parts = parseDateOnly(date);
          const outside = !date.startsWith(visibleMonthKey);
          const blocked = isDisabledDate(date);
          const isSelected = selected.has(date);
          return (
            <button
              key={date}
              ref={(node) => { if (node) dayRefs.current.set(date, node); else dayRefs.current.delete(date); }}
              id={`${calendarId}-${date}`}
              type="button"
              role="gridcell"
              aria-label={date}
              aria-selected={isSelected}
              disabled={blocked}
              tabIndex={date === focusedDate ? 0 : -1}
              onFocus={() => setFocusedDate(date)}
              onClick={(event: MouseEvent<HTMLButtonElement>) => selectDate(date, event.shiftKey, event.ctrlKey || event.metaKey)}
              onKeyDown={(event) => handleKeyDown(event, date)}
              className={`aspect-square rounded-lg text-xs font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500 ${
                isSelected ? "bg-blue-600 text-white hover:bg-blue-700" : date === today ? "ring-1 ring-blue-400 text-blue-700 hover:bg-blue-50" : "text-slate-700 hover:bg-slate-100"
              } ${outside ? "opacity-40" : ""} disabled:cursor-not-allowed disabled:opacity-25`}
            >
              {parts?.day}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <p className="text-xs font-medium text-slate-600">Selected dates: {normalized.length}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => commit([])} disabled={disabled || normalized.length === 0} className="text-xs font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-40">Clear</button>
          <button type="button" onClick={reset} disabled={disabled} className="text-xs font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-40">{resetLabel}</button>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Click to toggle dates. Shift-click selects an inclusive range; Ctrl/Cmd-click keeps non-contiguous selections.</p>
      {error ? <p role="alert" className="mt-2 text-xs font-medium text-red-600">{error}</p> : null}
    </div>
  );
}
