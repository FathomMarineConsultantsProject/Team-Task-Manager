"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import TaskWorkingDatesCalendar from "./TaskWorkingDatesCalendar";
import WorkdayExtensionModal from "./WorkdayExtensionModal";
import type { TaskWorkingSchedule } from "@/lib/manHours";
import { addDaysToDateOnly, compareDateOnly, listDateOnlyRange } from "@/lib/projectDateTime";

type Props = {
  taskId: string;
  taskTitle: string;
  taskStatus: string;
  startDate?: string | null;
  dueDate?: string | null;
  getAccessToken: () => Promise<string | null>;
  schedule: TaskWorkingSchedule | null;
  loading: boolean;
  loadError: string | null;
  onRetry: () => void;
  onChanged: (schedule: TaskWorkingSchedule) => void;
  onExtensionChanged: () => void | Promise<void>;
};

const activeStatuses = new Set(["in_progress", "draft_review", "in_review", "inprogress", "draftreview", "review"]);
const displayTime = (value: string) => {
  const [hourValue, minute = "00"] = value.split(":");
  const hour = Number(hourValue);
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? "PM" : "AM"}`;
};

const initialDatesFor = (
  schedule: TaskWorkingSchedule,
  startDate?: string | null,
  dueDate?: string | null,
) => {
  if (schedule.scheduleState !== "legacy") return schedule.dates;
  const start = startDate ?? schedule.todayLocalDate;
  const requestedEnd = dueDate && compareDateOnly(dueDate, start) >= 0
    ? dueDate
    : addDaysToDateOnly(start, 30);
  const boundedEnd = compareDateOnly(requestedEnd, addDaysToDateOnly(start, 365)) > 0
    ? addDaysToDateOnly(start, 365)
    : requestedEnd;
  return listDateOnlyRange(start, boundedEnd);
};

export default function TaskWorkingScheduleSection({
  taskId,
  taskTitle,
  taskStatus,
  startDate,
  dueDate,
  getAccessToken,
  schedule,
  loading,
  loadError,
  onRetry,
  onChanged,
  onExtensionChanged,
}: Props) {
  const [open, setOpen] = useState(false);
  const [dates, setDates] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [reasonRequired, setReasonRequired] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [extensionOpen, setExtensionOpen] = useState(false);

  useEffect(() => {
    if (schedule) setDates(initialDatesFor(schedule, startDate, dueDate));
  }, [dueDate, schedule, startDate]);

  const save = async () => {
    if (!dates.length) {
      setError("Select at least one working date.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Please sign in again.");
      const response = await fetch(`/api/tasks/${taskId}/working-dates`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ dates, ...(reasonRequired ? { reason: reason.trim() } : {}) }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 409) {
        setReasonRequired(Boolean(schedule?.canCorrectHistory));
        setError(schedule?.canCorrectHistory
          ? data.error ?? "Changing past working dates requires an audited correction reason."
          : "Only the project owner or an administrator may correct dates with recorded history.");
        return;
      }
      if (!response.ok) throw new Error(data.error ?? "Unable to save the working schedule.");
      const savedSchedule = data as TaskWorkingSchedule & { startDate?: string; endDate?: string };
      const savedDates = savedSchedule.dates ?? dates;
      setDates(savedDates);
      setReasonRequired(false);
      setReason("");
      const selected = new Set(savedDates);
      onChanged({
        ...savedSchedule,
        extensions: (savedSchedule.extensions ?? schedule?.extensions ?? [])
          .filter((extension) => selected.has(extension.workDate)),
        dateDetails: Object.fromEntries(
          Object.entries(savedSchedule.dateDetails ?? schedule?.dateDetails ?? {})
            .filter(([workDate]) => selected.has(workDate)),
        ),
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save the working schedule.");
    } finally {
      setSaving(false);
    }
  };

  const statusKey = taskStatus.toLowerCase().replace(/[\s-]+/g, "_");
  const canExtend = Boolean(schedule?.canManage && schedule.scheduleState === "configured" && schedule.todayIsSelected && activeStatuses.has(statusKey));

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50" aria-expanded={open}>
        <span>
          <span className="block text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400">Working Schedule</span>
          <span className="mt-0.5 block text-xs text-slate-500">Manage the dates and daily hours used for task man-hour tracking.</span>
          <span className="mt-0.5 block text-xs text-slate-500">
            {loading ? "Loading…" : schedule?.scheduleState === "legacy" ? "Schedule not configured" : `${schedule?.selectedDateCount ?? 0} working dates · Today: ${schedule?.todayIsSelected ? "Working day" : "Off day"} · Next: ${schedule?.nextSelectedDate ?? "None"} · ${schedule ? `${displayTime(schedule.normalWorkdayStart)}–${displayTime(schedule.normalWorkdayEnd)}` : ""}`}
          </span>
          {schedule?.currentExtension ? <span className="mt-1 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">Extended until {displayTime(schedule.currentExtension.extendedUntilLocalTime)}</span> : null}
        </span>
        {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
      </button>
      {open ? (
        <div className="space-y-3 border-t border-slate-100 p-4">
          {schedule ? (
            <>
              <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                <p><span className="font-semibold">Today:</span> {schedule.todayIsSelected ? "Selected" : "Off day"} ({schedule.todayLocalDate})</p>
                <p><span className="font-semibold">Next:</span> {schedule.nextSelectedDate ?? "None"}</p>
                <p><span className="font-semibold">Normal hours:</span> {displayTime(schedule.normalWorkdayStart)}–{displayTime(schedule.normalWorkdayEnd)}</p>
                <p><span className="font-semibold">Normal end:</span> {displayTime(schedule.normalWorkdayEnd)}</p>
                <p><span className="font-semibold">Timezone:</span> {schedule.timeZone}</p>
                {schedule.currentExtension ? <p><span className="font-semibold">Extended until:</span> {displayTime(schedule.currentExtension.extendedUntilLocalTime)}</p> : null}
              </div>
              <TaskWorkingDatesCalendar
                selectedDates={dates}
                onChange={setDates}
                startDate={startDate}
                dueDate={dueDate}
                timeZone={schedule.timeZone}
                disabled={!schedule.canManage || saving}
                resetDates={initialDatesFor(schedule, startDate, dueDate)}
                resetLabel="Restore original dates"
              />
              {reasonRequired ? (
                <label className="block text-xs font-semibold text-amber-800">
                  Historical correction reason
                  <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-amber-300 p-2 text-sm font-normal text-slate-800" />
                </label>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2">
                {activeStatuses.has(statusKey) && schedule.canManage ? (
                  <button type="button" onClick={() => setExtensionOpen(true)} disabled={!canExtend} title={schedule.scheduleState === "legacy" ? "Configure the schedule first" : !schedule.todayIsSelected ? "Today is an off date" : undefined} className="mr-auto rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                    {schedule.currentExtension ? "Edit extension" : "Extend Today’s Work Hours"}
                  </button>
                ) : null}
                <button type="button" onClick={() => { setDates(initialDatesFor(schedule, startDate, dueDate)); setReasonRequired(false); setReason(""); setError(null); }} disabled={saving} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel changes</button>
                <button type="button" onClick={() => void save()} disabled={saving || !schedule.canManage || !dates.length || (reasonRequired && !reason.trim())} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">{saving ? "Saving…" : schedule.scheduleState === "legacy" ? "Configure working dates" : "Save schedule"}</button>
              </div>
              {activeStatuses.has(statusKey) && schedule.canManage && !schedule.todayIsSelected ? <p className="text-xs text-slate-500">Today is not a selected working date.</p> : null}
            </>
          ) : null}
          {loadError ? (
            <div>
              <p role="alert" className="text-sm font-medium text-red-600">Working dates could not be loaded.</p>
              <button type="button" onClick={onRetry} className="mt-2 text-xs font-semibold text-blue-700">Retry</button>
            </div>
          ) : null}
          {error ? <p role="alert" className="text-sm font-medium text-red-600">{error}</p> : null}
          {schedule ? <WorkdayExtensionModal isOpen={extensionOpen} taskTitle={taskTitle} schedule={schedule} getAccessToken={getAccessToken} onClose={() => setExtensionOpen(false)} onChanged={onExtensionChanged} /> : null}
        </div>
      ) : null}
    </div>
  );
}
