"use client";

import { useCallback, useEffect, useState } from "react";
import Modal from "@/components/ui/modal";
import Button from "@/components/ui/button";
import type { TaskWorkingSchedule, TaskWorkdayExtension } from "@/lib/manHours";
import { parseTimeOnly } from "@/lib/projectDateTime";

type Props = {
  isOpen: boolean;
  taskTitle: string;
  schedule: TaskWorkingSchedule;
  getAccessToken: () => Promise<string | null>;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
};

const QUICK_TIMES = ["20:00", "21:00", "22:00", "23:00", "24:00"];
const LATEST_EXTENSION_MINUTES = 24 * 60;
const minutes = (value: string) => {
  if (value === "24:00" || value === "24:00:00") return LATEST_EXTENSION_MINUTES;
  const parsed = parseTimeOnly(value);
  return parsed ? parsed.hour * 60 + parsed.minute : NaN;
};
const displayTime = (value: string) => {
  if (value === "24:00" || value === "24:00:00") return "12:00 AM";
  const parsed = parseTimeOnly(value);
  if (!parsed) return value;
  const hour = parsed.hour % 12 || 12;
  return `${hour}:${String(parsed.minute).padStart(2, "0")} ${parsed.hour >= 12 ? "PM" : "AM"}`;
};
const timeFromMinutes = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
const defaultExtensionTime = (normalEnd: string) => timeFromMinutes(
  Math.min(minutes(normalEnd) + 60, LATEST_EXTENSION_MINUTES),
);

export default function WorkdayExtensionModal({ isOpen, taskTitle, schedule, getAccessToken, onClose, onChanged }: Props) {
  const [extension, setExtension] = useState<TaskWorkdayExtension | null>(schedule.currentExtension);
  const [extendedUntil, setExtendedUntil] = useState(schedule.currentExtension?.extendedUntilLocalTime.slice(0, 5) ?? defaultExtensionTime(schedule.normalWorkdayEnd));
  const [reason, setReason] = useState(schedule.currentExtension?.reason ?? "");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(async (method: "GET" | "PUT" | "DELETE", body?: object) => {
    const token = await getAccessToken();
    if (!token) throw new Error("Please sign in again.");
    const query = method === "GET" ? `?workDate=${encodeURIComponent(schedule.todayLocalDate)}` : "";
    const response = await fetch(`/api/tasks/${schedule.taskId}/workday-extensions${query}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "Unable to update the workday extension.");
    return data;
  }, [getAccessToken, schedule.taskId, schedule.todayLocalDate]);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    void request("GET")
      .then((data) => {
        const current = (data.extension ?? null) as TaskWorkdayExtension | null;
        setExtension(current?.cancelledAt ? null : current);
        setExtendedUntil(current && !current.cancelledAt ? current.extendedUntilLocalTime.slice(0, 5) : defaultExtensionTime(schedule.normalWorkdayEnd));
        setReason(current && !current.cancelledAt ? current.reason ?? "" : "");
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load the extension."))
      .finally(() => setLoading(false));
  }, [isOpen, request, schedule.normalWorkdayEnd]);

  const save = async () => {
    const endMinutes = minutes(extendedUntil);
    const normalMinutes = minutes(schedule.normalWorkdayEnd);
    if (
      !Number.isFinite(endMinutes)
      || endMinutes <= normalMinutes
      || endMinutes > Math.min(normalMinutes + 300, LATEST_EXTENSION_MINUTES)
    ) {
      setError("Workday extensions cannot exceed five hours after the normal end time or continue beyond midnight.");
      return;
    }
    if (endMinutes - normalMinutes > 120 && !reason.trim()) {
      setError("A reason is required for extensions longer than two hours.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await request("PUT", {
        workDate: schedule.todayLocalDate,
        extendedUntilLocalTime: extendedUntil,
        reason: reason.trim() || null,
      });
      await onChanged();
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save the extension.");
    } finally {
      setSaving(false);
    }
  };

  const cancelExtension = async () => {
    if (!reason.trim()) {
      setError("Enter a reason before cancelling the extension.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await request("DELETE", { workDate: schedule.todayLocalDate, reason: reason.trim() });
      await onChanged();
      onClose();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Unable to cancel the extension.");
    } finally {
      setSaving(false);
    }
  };

  const normalEndMinutes = minutes(schedule.normalWorkdayEnd);
  const latestEndMinutes = Math.min(normalEndMinutes + 300, LATEST_EXTENSION_MINUTES);
  const availableQuickTimes = QUICK_TIMES.filter((time) => {
    const value = minutes(time);
    return value > normalEndMinutes && value <= latestEndMinutes;
  });

  return (
    <Modal
      title="Extend Today’s Work Hours"
      isOpen={isOpen}
      onClose={onClose}
      footer={(
        <>
          {extension ? <Button variant="ghost" onClick={() => void cancelExtension()} disabled={saving || loading} className="mr-auto text-red-600">Cancel extension</Button> : null}
          <Button variant="ghost" onClick={onClose} disabled={saving}>Close</Button>
          <Button onClick={() => void save()} disabled={saving || loading || !schedule.canManage || !schedule.todayIsSelected}>{saving ? "Saving..." : extension ? "Update extension" : "Save extension"}</Button>
        </>
      )}
    >
      <div className="space-y-4 py-3">
        <p className="text-sm font-semibold text-slate-900">{taskTitle}</p>
        <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          <p><span className="font-semibold">Work date:</span> {schedule.todayLocalDate}</p>
          <p><span className="font-semibold">Normal end:</span> {displayTime(schedule.normalWorkdayEnd)} ({schedule.timeZone})</p>
          {extension ? <p className="mt-1 font-medium text-blue-700">Currently extended until {displayTime(extension.extendedUntilLocalTime)}</p> : null}
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Extend until</p>
          <p className="mb-2 text-xs text-slate-500">Extend this task for today, up to midnight.</p>
          <div className="flex flex-wrap gap-2">
            {availableQuickTimes.map((time) => (
              <button key={time} type="button" onClick={() => setExtendedUntil(time)} className={`rounded-lg border px-3 py-2 text-sm font-medium ${extendedUntil === time ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
                {displayTime(time)}
              </button>
            ))}
            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600">
              Custom
              <input aria-label="Custom extension end time" type="time" min={timeFromMinutes(normalEndMinutes + 1)} max={timeFromMinutes(Math.min(latestEndMinutes, 23 * 60 + 59))} value={extendedUntil === "24:00" ? "" : extendedUntil} onChange={(event) => setExtendedUntil(event.target.value)} className="w-[92px] bg-transparent text-sm text-slate-800 outline-none" />
            </label>
          </div>
        </div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Reason {minutes(extendedUntil) - minutes(schedule.normalWorkdayEnd) > 120 ? "(required)" : "(optional)"}
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="mt-2 w-full rounded-lg border border-slate-200 p-3 text-sm font-normal normal-case tracking-normal text-slate-800" placeholder="Why is extra time needed?" />
        </label>
        {!schedule.todayIsSelected ? <p className="text-sm font-medium text-amber-700">Today is not a selected working date. Configure the schedule before extending hours.</p> : null}
        {!schedule.canManage ? <p className="text-sm font-medium text-amber-700">You do not have permission to extend this task.</p> : null}
        {error ? <p role="alert" className="text-sm font-medium text-red-600">{error}</p> : null}
      </div>
    </Modal>
  );
}
