"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";

export type TaskCheckpoint = {
  id: string;
  taskId: string;
  title: string;
  sortOrder: number;
  isCompleted: boolean;
  completedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type TaskCheckpointSummary = {
  checkpointCount: number;
  completedCheckpointCount: number;
};

type TaskCheckpointsProps = {
  taskId: string;
  getAccessToken: () => Promise<string | null>;
  canManage?: boolean;
  onSummaryChange?: (taskId: string, summary: TaskCheckpointSummary) => void;
  compact?: boolean;
};

function summarize(checkpoints: TaskCheckpoint[]): TaskCheckpointSummary {
  return {
    checkpointCount: checkpoints.length,
    completedCheckpointCount: checkpoints.filter((checkpoint) => checkpoint.isCompleted).length,
  };
}

function sortCheckpoints(checkpoints: TaskCheckpoint[]) {
  return [...checkpoints].sort((a, b) => a.sortOrder - b.sortOrder || (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.id.localeCompare(b.id));
}

async function readJson(response: Response) {
  return response.json().catch(() => ({}));
}

export default function TaskCheckpoints({
  taskId,
  getAccessToken,
  canManage = false,
  onSummaryChange,
  compact = false,
}: TaskCheckpointsProps) {
  const [checkpoints, setCheckpoints] = useState<TaskCheckpoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [showAddInput, setShowAddInput] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const summary = useMemo(() => summarize(checkpoints), [checkpoints]);

  const notifySummary = useCallback(
    (nextCheckpoints: TaskCheckpoint[]) => {
      onSummaryChange?.(taskId, summarize(nextCheckpoints));
    },
    [onSummaryChange, taskId],
  );

  const withPending = useCallback(async (id: string, action: () => Promise<void>) => {
    setPendingIds((current) => new Set(current).add(id));
    try {
      await action();
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }, []);

  const loadCheckpoints = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Please sign in again to load checkpoints.");
      const response = await fetch(`/api/tasks/${taskId}/checkpoints`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await readJson(response) as { error?: string; checkpoints?: TaskCheckpoint[] };
      if (!response.ok) throw new Error(result.error ?? "Failed to load checkpoints.");
      const next = sortCheckpoints(result.checkpoints ?? []);
      setCheckpoints(next);
      notifySummary(next);
    } catch (err) {
      setCheckpoints([]);
      notifySummary([]);
      setError(err instanceof Error ? err.message : "Failed to load checkpoints.");
    } finally {
      setLoading(false);
    }
  }, [getAccessToken, notifySummary, taskId]);

  useEffect(() => {
    void loadCheckpoints();
  }, [loadCheckpoints]);

  const createCheckpoint = useCallback(async () => {
    const title = newTitle.trim();
    if (!title || isAdding) {
      if (!title) setError("Checkpoint title is required.");
      return;
    }
    setIsAdding(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Please sign in again to add checkpoints.");
      const response = await fetch(`/api/tasks/${taskId}/checkpoints`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const result = await readJson(response) as { error?: string; checkpoint?: TaskCheckpoint };
      if (!response.ok || !result.checkpoint) throw new Error(result.error ?? "Failed to add checkpoint.");
      setCheckpoints((current) => {
        const next = sortCheckpoints([...current, result.checkpoint as TaskCheckpoint]);
        notifySummary(next);
        return next;
      });
      setNewTitle("");
      setShowAddInput(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add checkpoint.");
    } finally {
      setIsAdding(false);
    }
  }, [getAccessToken, isAdding, newTitle, notifySummary, taskId]);

  const toggleCheckpoint = useCallback(async (checkpoint: TaskCheckpoint) => {
    const nextCompleted = !checkpoint.isCompleted;
    const previous = checkpoints;
    const optimistic = checkpoints.map((item) => item.id === checkpoint.id
      ? { ...item, isCompleted: nextCompleted, completedAt: nextCompleted ? new Date().toISOString() : null }
      : item);
    setCheckpoints(optimistic);
    notifySummary(optimistic);
    setError(null);

    await withPending(checkpoint.id, async () => {
      try {
        const token = await getAccessToken();
        if (!token) throw new Error("Please sign in again to update checkpoints.");
        const response = await fetch(`/api/tasks/${taskId}/checkpoints/${checkpoint.id}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ isCompleted: nextCompleted }),
        });
        const result = await readJson(response) as { error?: string; checkpoint?: TaskCheckpoint };
        if (!response.ok || !result.checkpoint) throw new Error(result.error ?? "Failed to update checkpoint.");
        setCheckpoints((current) => {
          const next = sortCheckpoints(current.map((item) => item.id === checkpoint.id ? result.checkpoint as TaskCheckpoint : item));
          notifySummary(next);
          return next;
        });
      } catch (err) {
        setCheckpoints(previous);
        notifySummary(previous);
        setError(err instanceof Error ? err.message : "Failed to update checkpoint.");
      }
    });
  }, [checkpoints, getAccessToken, notifySummary, taskId, withPending]);

  const saveRename = useCallback(async (checkpoint: TaskCheckpoint) => {
    const title = editingTitle.trim();
    if (!title) {
      setError("Checkpoint title is required.");
      return;
    }
    if (title === checkpoint.title) {
      setEditingId(null);
      setEditingTitle("");
      return;
    }

    setError(null);
    await withPending(checkpoint.id, async () => {
      try {
        const token = await getAccessToken();
        if (!token) throw new Error("Please sign in again to rename checkpoints.");
        const response = await fetch(`/api/tasks/${taskId}/checkpoints/${checkpoint.id}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        const result = await readJson(response) as { error?: string; checkpoint?: TaskCheckpoint };
        if (!response.ok || !result.checkpoint) throw new Error(result.error ?? "Failed to rename checkpoint.");
        setCheckpoints((current) => {
          const next = sortCheckpoints(current.map((item) => item.id === checkpoint.id ? result.checkpoint as TaskCheckpoint : item));
          notifySummary(next);
          return next;
        });
        setEditingId(null);
        setEditingTitle("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to rename checkpoint.");
      }
    });
  }, [editingTitle, getAccessToken, notifySummary, taskId, withPending]);

  const deleteCheckpoint = useCallback(async (checkpoint: TaskCheckpoint) => {
    const previous = checkpoints;
    const optimistic = checkpoints.filter((item) => item.id !== checkpoint.id);
    setCheckpoints(optimistic);
    notifySummary(optimistic);
    setError(null);

    await withPending(checkpoint.id, async () => {
      try {
        const token = await getAccessToken();
        if (!token) throw new Error("Please sign in again to delete checkpoints.");
        const response = await fetch(`/api/tasks/${taskId}/checkpoints/${checkpoint.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = await readJson(response) as { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Failed to delete checkpoint.");
      } catch (err) {
        setCheckpoints(previous);
        notifySummary(previous);
        setError(err instanceof Error ? err.message : "Failed to delete checkpoint.");
      }
    });
  }, [checkpoints, getAccessToken, notifySummary, taskId, withPending]);

  const completedLabel = summary.checkpointCount > 0
    ? `${summary.completedCheckpointCount} / ${summary.checkpointCount}`
    : "";

  return (
    <section className={compact ? "" : "overflow-hidden rounded-xl border border-slate-200 bg-white"}>
      <div className={compact ? "mb-2 flex items-center justify-between gap-3" : "flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3"}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400">Checkpoints</p>
        {completedLabel ? <span className="text-xs font-semibold text-slate-500">{completedLabel}</span> : null}
      </div>

      <div className={compact ? "space-y-2" : "space-y-2 px-4 py-3"}>
        {loading ? (
          <p className="text-sm text-slate-500">Loading checkpoints...</p>
        ) : null}

        {!loading && checkpoints.map((checkpoint) => {
          const isPending = pendingIds.has(checkpoint.id);
          const isEditing = editingId === checkpoint.id;
          return (
            <div key={checkpoint.id} className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2">
              <input
                type="checkbox"
                checked={checkpoint.isCompleted}
                disabled={!canManage || isPending}
                onChange={() => { void toggleCheckpoint(checkpoint); }}
                aria-label={`${checkpoint.isCompleted ? "Mark incomplete" : "Mark complete"}: ${checkpoint.title}`}
                className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
              />

              <div className="min-w-0 flex-1">
                {isEditing ? (
                  <input
                    type="text"
                    value={editingTitle}
                    onChange={(event) => setEditingTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void saveRename(checkpoint);
                      }
                      if (event.key === "Escape") {
                        setEditingId(null);
                        setEditingTitle("");
                      }
                    }}
                    disabled={isPending}
                    autoFocus
                    className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (!canManage) return;
                      setEditingId(checkpoint.id);
                      setEditingTitle(checkpoint.title);
                    }}
                    disabled={!canManage || isPending}
                    className={`block w-full text-left text-sm leading-5 text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${checkpoint.isCompleted ? "line-through decoration-slate-400 text-slate-500" : ""}`}
                  >
                    {checkpoint.title}
                  </button>
                )}
              </div>

              {canManage ? (
                <div className="flex shrink-0 items-center gap-1">
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        onClick={() => { void saveRename(checkpoint); }}
                        disabled={isPending}
                        aria-label={`Save checkpoint "${checkpoint.title}"`}
                        className="rounded-md p-1 text-emerald-700 hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 disabled:opacity-50"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setEditingTitle("");
                        }}
                        disabled={isPending}
                        aria-label={`Cancel editing checkpoint "${checkpoint.title}"`}
                        className="rounded-md p-1 text-slate-500 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 disabled:opacity-50"
                      >
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(checkpoint.id);
                        setEditingTitle(checkpoint.title);
                      }}
                      disabled={isPending}
                      aria-label={`Edit checkpoint "${checkpoint.title}"`}
                      className="rounded-md p-1 text-slate-500 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 disabled:opacity-50"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { void deleteCheckpoint(checkpoint); }}
                    disabled={isPending}
                    aria-label={`Delete checkpoint "${checkpoint.title}"`}
                    className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}

        {canManage ? (
          showAddInput ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void createCheckpoint();
                  }
                  if (event.key === "Escape") {
                    setShowAddInput(false);
                    setNewTitle("");
                  }
                }}
                disabled={isAdding}
                placeholder="Enter checkpoint..."
                className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { void createCheckpoint(); }}
                  disabled={isAdding || !newTitle.trim()}
                  className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {isAdding ? "Adding..." : "Add"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddInput(false);
                    setNewTitle("");
                    setError(null);
                  }}
                  disabled={isAdding}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAddInput(true)}
              className="text-sm font-semibold text-slate-700 hover:text-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
            >
              + Add checkpoint
            </button>
          )
        ) : null}

        {error ? <p role="alert" className="text-sm font-medium text-red-600">{error}</p> : null}
      </div>
    </section>
  );
}
