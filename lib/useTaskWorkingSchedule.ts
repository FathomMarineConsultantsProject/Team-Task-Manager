"use client";

import { useCallback, useRef, useState } from "react";
import type { TaskWorkingSchedule } from "@/lib/manHours";

type Entry = {
  schedule: TaskWorkingSchedule | null;
  loading: boolean;
  error: string | null;
};

const EMPTY_ENTRY: Entry = { schedule: null, loading: false, error: null };

export default function useTaskWorkingSchedule(getAccessToken: () => Promise<string | null>) {
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const entriesRef = useRef(entries);
  const inFlight = useRef(new Map<string, Promise<TaskWorkingSchedule | null>>());

  const setEntry = useCallback((taskId: string, update: (entry: Entry) => Entry) => {
    setEntries((current) => {
      const next = { ...current, [taskId]: update(current[taskId] ?? EMPTY_ENTRY) };
      entriesRef.current = next;
      return next;
    });
  }, []);

  const update = useCallback((taskId: string, schedule: TaskWorkingSchedule) => {
    setEntry(taskId, () => ({
      schedule: {
        ...schedule,
        extensions: schedule.extensions ?? [],
        dateDetails: schedule.dateDetails ?? {},
      },
      loading: false,
      error: null,
    }));
  }, [setEntry]);

  const request = useCallback(async (taskId: string, force: boolean) => {
    const cached = entriesRef.current[taskId]?.schedule;
    if (!force && cached) return cached;
    const pending = inFlight.current.get(taskId);
    if (pending) return pending;

    setEntry(taskId, (entry) => ({ ...entry, loading: true, error: null }));
    const promise = (async () => {
      try {
        const token = await getAccessToken();
        if (!token) throw new Error("Please sign in again to load working dates.");
        const response = await fetch(`/api/tasks/${taskId}/working-dates`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const result = await response.json().catch(() => ({})) as TaskWorkingSchedule & { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Working dates could not be loaded.");
        const schedule = {
          ...result,
          extensions: result.extensions ?? [],
          dateDetails: result.dateDetails ?? {},
        };
        update(taskId, schedule);
        return schedule;
      } catch (error) {
        setEntry(taskId, (entry) => ({
          ...entry,
          loading: false,
          error: error instanceof Error ? error.message : "Working dates could not be loaded.",
        }));
        return null;
      } finally {
        inFlight.current.delete(taskId);
      }
    })();
    inFlight.current.set(taskId, promise);
    return promise;
  }, [getAccessToken, setEntry, update]);

  const load = useCallback((taskId: string) => request(taskId, false), [request]);
  const retry = useCallback((taskId: string) => request(taskId, true), [request]);
  const invalidate = useCallback((taskId: string) => request(taskId, true), [request]);
  const getSchedule = useCallback((taskId: string) => entries[taskId]?.schedule ?? null, [entries]);
  const getLoading = useCallback((taskId: string) => entries[taskId]?.loading ?? false, [entries]);
  const getError = useCallback((taskId: string) => entries[taskId]?.error ?? null, [entries]);

  return { getSchedule, getLoading, getError, load, retry, update, invalidate };
}

export type TaskWorkingScheduleResource = ReturnType<typeof useTaskWorkingSchedule>;
