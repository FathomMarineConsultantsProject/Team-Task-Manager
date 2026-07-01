"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import LinkifiedText from "@/components/ui/LinkifiedText";

type SupabaseClient = {
  from: (table: string) => any;
};

type TaskDependency = {
  id: string;
  task_id: string;
  project_id: string;
  title: string;
  details: string | null;
  status: "pending" | "resolved";
  due_at: string | null;
  created_by: string;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

type TaskDependenciesProps = {
  supabase: SupabaseClient;
  taskId: string;
  projectId: string | null;
  currentUserId: string | null;
  canManageDependencies: boolean;
  showHeader?: boolean;
  onPendingCountChange?: (count: number) => void;
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
};

const formatDueDate = (value: string | null | undefined) => {
  if (!value) return "Not set";
  return formatDate(value);
};

const isPendingDependencyOverdue = (item: TaskDependency) => {
  if (item.status !== "pending" || !item.due_at) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${item.due_at}T00:00:00`);
  return !Number.isNaN(due.getTime()) && due < today;
};

const sortDependencies = (items: TaskDependency[]) =>
  [...items].sort((left, right) => {
    if (left.status !== right.status) return left.status === "pending" ? -1 : 1;
    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  });

export default function TaskDependencies({
  supabase,
  taskId,
  projectId,
  currentUserId,
  canManageDependencies,
  showHeader = true,
  onPendingCountChange,
}: TaskDependenciesProps) {
  const [items, setItems] = useState<TaskDependency[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingDetails, setEditingDetails] = useState("");
  const [editingDueAt, setEditingDueAt] = useState("");
  const hasTaskId = Boolean(taskId);
  const hasProjectId = Boolean(projectId);
  const canMutateDependencies = canManageDependencies && Boolean(currentUserId) && hasTaskId && hasProjectId;
  const pendingItemsCount = items.filter((item) => item.status === "pending").length;

  const loadDependencies = useCallback(async () => {
    if (!taskId) {
      setItems([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const { data, error: loadError } = await supabase
        .from("task_dependencies")
        .select("id, task_id, project_id, title, details, status, due_at, created_by, resolved_by, resolved_at, created_at, updated_at")
        .eq("task_id", taskId)
        .order("status", { ascending: true })
        .order("created_at", { ascending: false });

      if (loadError) {
        console.error("Task dependencies load error:", loadError);
        setError("Could not load pending inputs.");
        setItems([]);
        return;
      }

      setItems(sortDependencies((data ?? []) as TaskDependency[]));
    } catch (loadException) {
      console.error("Task dependencies load error:", loadException);
      setError("Could not load pending inputs.");
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, taskId]);

  useEffect(() => {
    void loadDependencies();
  }, [loadDependencies]);

  useEffect(() => {
    onPendingCountChange?.(pendingItemsCount);
  }, [onPendingCountChange, pendingItemsCount]);

  const resetAddForm = () => {
    setTitle("");
    setDetails("");
    setDueAt("");
  };

  const handleAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle || !currentUserId || !projectId || !canMutateDependencies) return;

    setIsSaving(true);
    setError(null);
    try {
      const { error: insertError } = await supabase.from("task_dependencies").insert({
        task_id: taskId,
        project_id: projectId,
        title: cleanTitle,
        details: details.trim() || null,
        due_at: dueAt || null,
        status: "pending",
        created_by: currentUserId,
      });

      if (insertError) {
        console.error("Task dependency add error:", insertError);
        setError("Could not add pending input.");
        return;
      }

      resetAddForm();
      await loadDependencies();
    } finally {
      setIsSaving(false);
    }
  };

  const startEditing = (item: TaskDependency) => {
    setEditingId(item.id);
    setEditingTitle(item.title);
    setEditingDetails(item.details ?? "");
    setEditingDueAt(item.due_at ?? "");
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingTitle("");
    setEditingDetails("");
    setEditingDueAt("");
  };

  const saveEdit = async (itemId: string) => {
    const cleanTitle = editingTitle.trim();
    if (!cleanTitle || !canMutateDependencies) return;

    setIsSaving(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from("task_dependencies")
        .update({
          title: cleanTitle,
          details: editingDetails.trim() || null,
          due_at: editingDueAt || null,
        })
        .eq("id", itemId)
        .eq("task_id", taskId);

      if (updateError) {
        console.error("Task dependency edit error:", updateError);
        setError("Could not update pending input.");
        return;
      }

      cancelEditing();
      await loadDependencies();
    } finally {
      setIsSaving(false);
    }
  };

  const setStatus = async (item: TaskDependency, status: "pending" | "resolved") => {
    if (!canMutateDependencies) return;

    setIsSaving(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from("task_dependencies")
        .update({
          status,
          resolved_by: status === "resolved" ? currentUserId : null,
          resolved_at: status === "resolved" ? new Date().toISOString() : null,
        })
        .eq("id", item.id)
        .eq("task_id", taskId);

      if (updateError) {
        console.error("Task dependency status error:", updateError);
        setError("Could not update pending input status.");
        return;
      }

      await loadDependencies();
    } finally {
      setIsSaving(false);
    }
  };

  const deleteItem = async (item: TaskDependency) => {
    if (!canMutateDependencies) return;

    setIsSaving(true);
    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from("task_dependencies")
        .delete()
        .eq("id", item.id)
        .eq("task_id", taskId);

      if (deleteError) {
        console.error("Task dependency delete error:", deleteError);
        setError("Could not delete pending input.");
        return;
      }

      await loadDependencies();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className={showHeader ? "rounded-xl border border-slate-200 bg-white px-3 py-3" : "min-w-0"}>
      {showHeader && (
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400">
              Key Dependencies / Pending Inputs
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Track client inputs, approvals, or blockers needed for this task.
            </p>
          </div>
          {items.length > 0 && (
            <span className="inline-flex min-w-fit shrink-0 whitespace-nowrap items-center justify-center rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold leading-none text-amber-700">
              {pendingItemsCount} pending
            </span>
          )}
        </div>
      )}

      {(!hasTaskId || !hasProjectId) && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          Pending inputs are visible, but changes are disabled because task context is incomplete.
        </p>
      )}

      {canMutateDependencies && (
        <form onSubmit={handleAdd} className="mt-3 space-y-2">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Add dependency or pending input..."
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-[#381a78]"
            disabled={isSaving}
          />
          <textarea
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            placeholder="Optional details"
            rows={2}
            className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-[#381a78]"
            disabled={isSaving}
          />
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Due date / target date</span>
            <input
              type="date"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-[#381a78]"
              disabled={isSaving}
            />
          </label>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSaving || !title.trim()}
              className="rounded-lg bg-[#2d1460] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#381a78] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          {error}
        </p>
      )}

      <div className="mt-3 space-y-2">
        {isLoading ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
            Loading pending inputs...
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
            No pending inputs added.
          </div>
        ) : (
          items.map((item) => {
            const isResolved = item.status === "resolved";
            const isEditing = editingId === item.id;
            const isOverdue = isPendingDependencyOverdue(item);
            return (
              <div
                key={item.id}
                className={`rounded-lg border px-3 py-2 ${isResolved ? "border-slate-200 bg-slate-50 opacity-80" : "border-amber-200 bg-amber-50/60"}`}
              >
                {isEditing ? (
                  <div className="space-y-2">
                    <input
                      value={editingTitle}
                      onChange={(event) => setEditingTitle(event.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#381a78]"
                      disabled={isSaving}
                    />
                    <textarea
                      value={editingDetails}
                      onChange={(event) => setEditingDetails(event.target.value)}
                      rows={2}
                      className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#381a78]"
                      disabled={isSaving}
                    />
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Due date / target date</span>
                      <input
                        type="date"
                        value={editingDueAt}
                        onChange={(event) => setEditingDueAt(event.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#381a78]"
                        disabled={isSaving}
                      />
                    </label>
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={cancelEditing} className="rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-white">
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveEdit(item.id)}
                        disabled={isSaving || !editingTitle.trim()}
                        className="rounded-md bg-[#2d1460] px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className={`break-words text-sm font-semibold ${isResolved ? "text-slate-500 line-through" : "text-slate-900"}`}>
                          <LinkifiedText text={item.title} />
                        </p>
                        {item.details && (
                          <p className="mt-1 whitespace-pre-wrap break-words text-xs text-slate-600">
                            <LinkifiedText text={item.details} />
                          </p>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <p className="text-[11px] text-slate-500">Due: {formatDueDate(item.due_at)}</p>
                          {isOverdue && (
                            <span className="inline-flex items-center whitespace-nowrap rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                              Input overdue
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] text-slate-400">Created {formatDate(item.created_at)}</p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isResolved ? "bg-slate-200 text-slate-600" : "bg-amber-100 text-amber-700"}`}>
                        {isResolved ? "Resolved" : "Pending"}
                      </span>
                    </div>

                    {canMutateDependencies && (
                      <div className="mt-2 flex flex-wrap justify-end gap-2">
                        <button type="button" onClick={() => startEditing(item)} className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-white">
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void setStatus(item, isResolved ? "pending" : "resolved")}
                          className="rounded-md px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-white"
                        >
                          {isResolved ? "Reopen" : "Resolve"}
                        </button>
                        <button type="button" onClick={() => void deleteItem(item)} className="rounded-md px-2 py-1 text-xs font-semibold text-red-600 hover:bg-white">
                          Delete
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
