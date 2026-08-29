"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import ModalPortal from "@/components/ModalPortal";
import type { TaskWorkingDateDetail, TaskWorkingDateExtension } from "@/lib/manHours";
import { addDaysToDateOnly, compareDateOnly, getProjectLocalDate, isDateOnly, listDateOnlyRange, parseDateOnly, parseTimeOnly } from "@/lib/projectDateTime";

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
  readOnly?: boolean;
  compact?: boolean;
  hideToolbarActions?: boolean;
  highlightedExtensions?: TaskWorkingDateExtension[];
  dateDetails?: Record<string, TaskWorkingDateDetail>;
  normalWorkdayStart?: string;
  normalWorkdayEnd?: string;
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

function dateLabel(value: string) {
  const parts = parseDateOnly(value);
  if (!parts) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeZone: "UTC" })
    .format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)));
}

function displayTime(value: string) {
  if (value === "24:00" || value === "24:00:00") return "12:00 AM";
  const parsed = parseTimeOnly(value);
  if (!parsed) return value;
  return `${parsed.hour % 12 || 12}:${String(parsed.minute).padStart(2, "0")} ${parsed.hour >= 12 ? "PM" : "AM"}`;
}

function changedAtLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

const changeTypeLabel = {
  WORKING_DATE_ADDED: "Working date added",
  WORKING_DATE_REMOVED: "Working date removed",
  WORK_HOURS_EXTENDED: "Work hours extended",
  WORK_HOURS_CHANGED: "Work hours changed",
  WORK_HOURS_CANCELLED: "Work-hours extension cancelled",
} as const;

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
  readOnly = false,
  compact = false,
  hideToolbarActions = false,
  highlightedExtensions = [],
  dateDetails = {},
  normalWorkdayStart,
  normalWorkdayEnd,
}: Props) {
  const today = getProjectLocalDate(timeZone);
  const normalized = useMemo(() => [...new Set(selectedDates.filter(isDateOnly))].sort(), [selectedDates]);
  const initialVisibleDate = normalized.some((date) => monthStart(date) === monthStart(today))
    ? today
    : normalized.find((date) => compareDateOnly(date, today) > 0) ?? normalized[0] ?? startDate ?? today;
  const [visibleMonth, setVisibleMonth] = useState(() => monthStart(initialVisibleDate));
  const [focusedDate, setFocusedDate] = useState(() => initialVisibleDate);
  const [anchorDate, setAnchorDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const calendarId = useId();
  const dayRefs = useRef(new Map<string, HTMLButtonElement>());
  const focusRequested = useRef(false);
  const tooltipId = useId();
  const [tooltip, setTooltip] = useState<{
    date: string;
    left: number;
    top: number;
    above: boolean;
    maxHeight: number;
  } | null>(null);

  const cells = useMemo(() => {
    const parts = parseDateOnly(visibleMonth);
    if (!parts) return [];
    const first = new Date(Date.UTC(parts.year, parts.month - 1, 1));
    return Array.from({ length: 42 }, (_, index) => fromUtcDate(
      new Date(Date.UTC(parts.year, parts.month - 1, index + 1 - first.getUTCDay())),
    ));
  }, [visibleMonth]);

  useEffect(() => {
    if (readOnly && !focusRequested.current) return;
    if (!cells.includes(focusedDate)) return;
    dayRefs.current.get(focusedDate)?.focus();
    focusRequested.current = false;
  }, [cells, focusedDate, readOnly]);

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
    if (readOnly || isDisabledDate(date)) return;
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
    focusRequested.current = true;
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
    } else if (!readOnly && (event.key === "Enter" || event.key === " ")) {
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
  const extensions = new Map(highlightedExtensions.map((extension) => [extension.workDate, extension]));
  const showTooltip = (date: string, element: HTMLButtonElement) => {
    if (!readOnly) return;
    const rect = element.getBoundingClientRect();
    const width = Math.min(260, window.innerWidth - 16);
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const above = spaceBelow < 268 && spaceAbove > spaceBelow;
    setTooltip({
      date,
      left: Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8)),
      top: above ? rect.top - 8 : rect.bottom + 8,
      above,
      maxHeight: Math.max(24, above ? spaceAbove : spaceBelow),
    });
  };
  const tooltipSelected = tooltip ? selected.has(tooltip.date) : false;
  const tooltipDetail = tooltip ? dateDetails[tooltip.date] : undefined;
  const tooltipExtension = tooltip
    ? tooltipDetail?.extension ?? (tooltipSelected ? extensions.get(tooltip.date) ?? null : null)
    : null;
  const tooltipHistory = (tooltipDetail?.history ?? []).filter((entry) => Boolean(entry.reason));

  return (
    <div className={`rounded-xl border border-slate-200 bg-white ${compact ? "p-1.5" : "p-3"}`}>
      <div className={`${compact ? "mb-1" : "mb-3"} flex items-center justify-between gap-2`}>
        <button type="button" aria-label="Previous month" onClick={() => setVisibleMonth(moveMonth(visibleMonth, -1))} disabled={disabled} className={`rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-40 ${compact ? "p-1" : "p-2"}`}>
          <ChevronLeft size={compact ? 14 : 16} />
        </button>
        <p className={`${compact ? "text-xs" : "text-sm"} font-semibold text-slate-800`}>{monthLabel(visibleMonth)}</p>
        <button type="button" aria-label="Next month" onClick={() => setVisibleMonth(moveMonth(visibleMonth, 1))} disabled={disabled} className={`rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-40 ${compact ? "p-1" : "p-2"}`}>
          <ChevronRight size={compact ? 14 : 16} />
        </button>
      </div>
      <div role="grid" aria-label="Working dates calendar" className={`grid grid-cols-7 ${compact ? "gap-0.5" : "gap-1"}`}>
        {WEEKDAYS.map((day) => <div key={day} role="columnheader" className={`text-center font-semibold uppercase text-slate-400 ${compact ? "py-0.5 text-[9px]" : "py-1 text-[10px]"}`}>{day}</div>)}
        {cells.map((date) => {
          const parts = parseDateOnly(date);
          const outside = !date.startsWith(visibleMonthKey);
          const blocked = isDisabledDate(date);
          const isSelected = selected.has(date);
          const extension = isSelected ? extensions.get(date) : undefined;
          const accessibleLabel = extension
            ? `${dateLabel(date)}, working day, extended until ${displayTime(extension.extendedUntilLocalTime)}${extension.reason ? `. Reason: ${extension.reason}.` : ""}`
            : `${dateLabel(date)}, ${isSelected ? "working day" : "off day"}`;
          const tone = extension
            ? "bg-amber-300 text-slate-950"
            : isSelected
              ? "bg-blue-600 text-white"
              : "border border-slate-200 bg-white text-slate-700";
          return (
            <button
              key={date}
              ref={(node) => { if (node) dayRefs.current.set(date, node); else dayRefs.current.delete(date); }}
              id={`${calendarId}-${date}`}
              type="button"
              role="gridcell"
              aria-label={accessibleLabel}
              aria-selected={isSelected}
              aria-describedby={tooltip?.date === date ? tooltipId : undefined}
              disabled={blocked}
              title={readOnly ? undefined : accessibleLabel}
              tabIndex={date === focusedDate ? 0 : -1}
              onFocus={() => setFocusedDate(date)}
              onMouseEnter={(event) => showTooltip(date, event.currentTarget)}
              onMouseLeave={() => setTooltip(null)}
              onBlur={() => setTooltip(null)}
              onFocusCapture={(event) => showTooltip(date, event.currentTarget)}
              onClick={(event: MouseEvent<HTMLButtonElement>) => {
                if (!readOnly) selectDate(date, event.shiftKey, event.ctrlKey || event.metaKey);
              }}
              onKeyDown={(event) => handleKeyDown(event, date)}
              className={`relative rounded-lg font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500 ${tone} ${
                compact ? "h-7" : "aspect-square"
              } ${
                compact ? "text-[11px]" : "text-xs"
              } ${date === today ? extension ? "ring-1 ring-amber-700 ring-inset" : isSelected ? "ring-1 ring-white ring-inset" : "ring-1 ring-slate-400 ring-offset-0" : ""} ${outside ? "opacity-40" : ""} ${
                readOnly ? "cursor-default" : "hover:brightness-95"
              } disabled:cursor-not-allowed disabled:opacity-25`}
            >
              {parts?.day}
              {extension ? <span aria-hidden="true" className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-slate-900" /> : null}
            </button>
          );
        })}
      </div>
      {!readOnly && !hideToolbarActions ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <p className="text-xs font-medium text-slate-600">Selected dates: {normalized.length}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => commit([])} disabled={disabled || normalized.length === 0} className="text-xs font-semibold text-slate-500 hover:text-slate-800 disabled:opacity-40">Clear</button>
            <button type="button" onClick={reset} disabled={disabled} className="text-xs font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-40">{resetLabel}</button>
          </div>
        </div>
      ) : null}
      {!readOnly ? <p className="mt-2 text-[11px] text-slate-500">Click to toggle dates. Shift-click selects an inclusive range; Ctrl/Cmd-click keeps non-contiguous selections.</p> : null}
      {error ? <p role="alert" className="mt-2 text-xs font-medium text-red-600">{error}</p> : null}
      {tooltip ? (
        <ModalPortal>
          <div
            id={tooltipId}
            role="tooltip"
            className="pointer-events-none fixed z-[10020] w-[260px] max-w-[calc(100vw-16px)] overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 text-left text-xs text-slate-700 shadow-lg"
            style={{
              left: tooltip.left,
              top: tooltip.top,
              maxHeight: tooltip.maxHeight,
              transform: tooltip.above ? "translateY(-100%)" : undefined,
            }}
          >
            <p className="font-semibold text-slate-950">{dateLabel(tooltip.date)}</p>
            {!tooltipSelected ? (
              <div className="mt-2 space-y-2.5">
                <p className="text-slate-600">Off day</p>
                {tooltipHistory.length ? (
                  <div className="space-y-2 border-t border-slate-100 pt-2">
                    {tooltipHistory.map((entry) => (
                      <div key={entry.id} className="space-y-1">
                        <p className="font-semibold text-slate-700">{changeTypeLabel[entry.changeType]}</p>
                        <p><span className="font-semibold text-slate-500">Schedule changed by:</span> {entry.actorName}</p>
                        {entry.reason ? <p><span className="font-semibold text-slate-500">Reason:</span> <span className="break-words">{entry.reason}</span></p> : null}
                        <p><span className="font-semibold text-slate-500">Changed:</span> {changedAtLabel(entry.changedAt)}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-2 space-y-2.5">
                <div>
                  <p className="font-semibold text-slate-500">
                    {tooltipDetail?.assignees[0]?.source === "current" ? "Currently assigned" : "People"}
                  </p>
                  {tooltipDetail?.assignees.length ? (
                    <ul className="mt-1 space-y-0.5">
                      {tooltipDetail.assignees.map((assignee) => (
                        <li key={assignee.userId ?? `snapshot:${assignee.name}`}>{assignee.name}</li>
                      ))}
                    </ul>
                  ) : <p className="mt-1">No assignee activity recorded</p>}
                </div>
                {normalWorkdayStart && normalWorkdayEnd ? (
                  <div>
                    <p className="font-semibold text-slate-500">{tooltipExtension ? "Normal hours" : "Working hours"}</p>
                    <p className="mt-1">{displayTime(normalWorkdayStart)}–{displayTime(normalWorkdayEnd)}</p>
                  </div>
                ) : null}
                {tooltipExtension ? (
                  <div>
                    <p className="font-semibold text-slate-500">Extended until</p>
                    <p className="mt-1">{displayTime(tooltipExtension.extendedUntilLocalTime)}</p>
                  </div>
                ) : null}
                {tooltipExtension?.reason ? (
                  <div>
                    <p className="font-semibold text-slate-500">Reason</p>
                    <p className="mt-1 break-words">{tooltipExtension.reason}</p>
                  </div>
                ) : null}
                {tooltipHistory.length ? (
                  <div className="space-y-2 border-t border-slate-100 pt-2">
                    {tooltipHistory.map((entry) => {
                      const isHours = entry.changeType.startsWith("WORK_HOURS");
                      return (
                        <div key={entry.id} className="space-y-1">
                          <p className="font-semibold text-slate-700">{changeTypeLabel[entry.changeType]}</p>
                          {isHours && (entry.oldValue || entry.newValue) ? (
                            <p>
                              <span className="font-semibold text-slate-500">Hours:</span>{" "}
                              {entry.oldValue ? displayTime(entry.oldValue) : displayTime(normalWorkdayEnd ?? "")}
                              {" → "}
                              {entry.newValue ? displayTime(entry.newValue) : "Normal hours"}
                            </p>
                          ) : null}
                          <p><span className="font-semibold text-slate-500">Schedule changed by:</span> {entry.actorName}</p>
                          {entry.reason ? <p><span className="font-semibold text-slate-500">Reason:</span> <span className="break-words">{entry.reason}</span></p> : null}
                          <p><span className="font-semibold text-slate-500">Changed:</span> {changedAtLabel(entry.changedAt)}</p>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </ModalPortal>
      ) : null}
    </div>
  );
}
