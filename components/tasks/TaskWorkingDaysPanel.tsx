"use client";

import TaskWorkingDatesCalendar from "@/components/tasks/TaskWorkingDatesCalendar";
import type { TaskWorkingSchedule } from "@/lib/manHours";
import { parseTimeOnly } from "@/lib/projectDateTime";

type Props = {
  schedule: TaskWorkingSchedule | null;
  loading: boolean;
  error: string | null;
  canManage: boolean;
  onRetry: () => void;
  onEdit: () => void;
  className?: string;
};

function displayTime(value: string) {
  const parsed = parseTimeOnly(value);
  if (!parsed) return value;
  return `${parsed.hour % 12 || 12}:${String(parsed.minute).padStart(2, "0")} ${parsed.hour >= 12 ? "PM" : "AM"}`;
}

export default function TaskWorkingDaysPanel({
  schedule,
  loading,
  error,
  canManage,
  onRetry,
  onEdit,
  className = "",
}: Props) {
  return (
    <section className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl ${className}`} aria-label="Working Days">
      <div className="p-3.5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Working Days</p>
        <p className="mt-0.5 text-[11px] text-slate-500">Selected dates used for man-hour tracking.</p>

        {loading || (!schedule && !error) ? (
          <div className="mt-4 animate-pulse space-y-2" aria-label="Loading working dates">
            <div className="h-4 w-28 rounded bg-slate-200" />
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }, (_, index) => <div key={index} className="aspect-square rounded bg-slate-100" />)}
            </div>
          </div>
        ) : error ? (
          <div className="mt-4 rounded-lg bg-slate-50 p-3">
            <p role="alert" className="text-sm text-slate-700">Working dates could not be loaded.</p>
            <button type="button" onClick={onRetry} className="mt-2 text-xs font-semibold text-blue-700 hover:text-blue-900">Retry</button>
          </div>
        ) : schedule?.scheduleState === "legacy" ? (
          <div className="mt-4 rounded-lg bg-slate-50 p-3">
            <p className="text-sm font-medium text-slate-700">Working schedule not configured.</p>
          </div>
        ) : schedule && schedule.dates.length === 0 ? (
          <div className="mt-4 rounded-lg bg-slate-50 p-3">
            <p className="text-sm font-medium text-slate-700">No working dates selected.</p>
          </div>
        ) : schedule ? (
          <>
            <div className="mt-2.5">
              <TaskWorkingDatesCalendar
                key={schedule.taskId}
                selectedDates={schedule.dates}
                onChange={() => undefined}
                timeZone={schedule.timeZone}
                readOnly
                compact
                hideToolbarActions
                highlightedExtensions={schedule.extensions}
                dateDetails={schedule.dateDetails}
                normalWorkdayStart={schedule.normalWorkdayStart}
                normalWorkdayEnd={schedule.normalWorkdayEnd}
              />
            </div>
            <div className="mt-2.5 space-y-0.5 text-[11px] text-slate-600">
              <p><span className="font-semibold text-slate-800">{schedule.selectedDateCount}</span> working days · <span className="font-semibold text-slate-800">{displayTime(schedule.normalWorkdayStart)}–{displayTime(schedule.normalWorkdayEnd)}</span></p>
              <p><span className="font-semibold text-slate-800">{schedule.extensions.length}</span> extended days</p>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1 border-t border-slate-100 pt-2 text-[10px] text-slate-600" aria-label="Calendar legend">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded bg-blue-600" />Blue — Working</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded bg-amber-300" />Yellow — Extended</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded border border-slate-300 bg-white" />White — Off</span>
            </div>
          </>
        ) : null}

        {schedule && canManage ? (
          <div className="mt-2.5 border-t border-slate-100 pt-2.5">
            <button type="button" onClick={onEdit} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              Edit Working Dates
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
