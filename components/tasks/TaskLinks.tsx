"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ExternalLink, Link as LinkIcon, Loader2 } from "lucide-react";

type SupabaseClient = {
  from: (table: string) => any;
};

type TaskLink = {
  id: string;
  task_id: string;
  project_id: string;
  url: string;
  label: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type TaskLinksProps = {
  supabase: SupabaseClient;
  taskId: string;
  projectId: string;
  currentUserId: string | null;
  canManageLinks: boolean;
  showHeader?: boolean;
  onLinksCountChange?: (count: number) => void;
};

export function normalizeUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const withProtocol = trimmed.toLowerCase().startsWith("www.") ? `https://${trimmed}` : trimmed;

  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function getDisplayLabel(link: Pick<TaskLink, "url" | "label">): string {
  const cleanLabel = link.label?.trim();
  if (cleanLabel) return cleanLabel;

  try {
    return new URL(link.url).hostname || "Link";
  } catch {
    return "Link";
  }
}

function sortLinks(items: TaskLink[]) {
  return [...items].sort((left, right) => {
    if (left.sort_order !== right.sort_order) return left.sort_order - right.sort_order;
    return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
  });
}

export default function TaskLinks({
  supabase,
  taskId,
  projectId,
  currentUserId,
  canManageLinks,
  showHeader = true,
  onLinksCountChange,
}: TaskLinksProps) {
  const [links, setLinks] = useState<TaskLink[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingUrl, setEditingUrl] = useState("");
  const [editingLabel, setEditingLabel] = useState("");
  const canMutateLinks = canManageLinks && Boolean(currentUserId) && Boolean(taskId) && Boolean(projectId);

  const loadLinks = useCallback(async () => {
    if (!taskId) {
      setLinks([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const { data, error: loadError } = await supabase
        .from("task_links")
        .select("id, task_id, project_id, url, label, sort_order, created_by, created_at, updated_at")
        .eq("task_id", taskId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (loadError) {
        console.error("Task links load error:", loadError);
        setError("Could not load links.");
        setLinks([]);
        return;
      }

      setLinks(sortLinks((data ?? []) as TaskLink[]));
    } catch (loadException) {
      console.error("Task links load error:", loadException);
      setError("Could not load links.");
      setLinks([]);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, taskId]);

  useEffect(() => {
    void loadLinks();
  }, [loadLinks]);

  useEffect(() => {
    onLinksCountChange?.(links.length);
  }, [links.length, onLinksCountChange]);

  const resetAddForm = () => {
    setUrl("");
    setLabel("");
  };

  const handleAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canMutateLinks) return;

    const normalizedUrl = normalizeUrl(url);
    if (!normalizedUrl) {
      setError("Enter a valid http:// or https:// link.");
      return;
    }

    const cleanLabel = label.trim() || null;
    const nextSortOrder = links.reduce((max, item) => Math.max(max, item.sort_order), -1) + 1;

    setIsSaving(true);
    setError(null);
    try {
      const { data, error: insertError } = await supabase
        .from("task_links")
        .insert({
          task_id: taskId,
          project_id: projectId,
          url: normalizedUrl,
          label: cleanLabel,
          sort_order: nextSortOrder,
          created_by: currentUserId,
        })
        .select("id, task_id, project_id, url, label, sort_order, created_by, created_at, updated_at")
        .single();

      if (insertError) {
        console.error("Task link add error:", insertError);
        setError("Could not add link.");
        return;
      }

      resetAddForm();
      if (data) {
        setLinks((prev) => sortLinks([...(prev ?? []), data as TaskLink]));
      } else {
        await loadLinks();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const startEditing = (link: TaskLink) => {
    setEditingId(link.id);
    setEditingUrl(link.url);
    setEditingLabel(link.label ?? "");
    setError(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingUrl("");
    setEditingLabel("");
  };

  const saveEdit = async (linkId: string) => {
    if (!canMutateLinks) return;

    const normalizedUrl = normalizeUrl(editingUrl);
    if (!normalizedUrl) {
      setError("Enter a valid http:// or https:// link.");
      return;
    }

    const cleanLabel = editingLabel.trim() || null;

    setIsSaving(true);
    setError(null);
    try {
      const { data, error: updateError } = await supabase
        .from("task_links")
        .update({
          url: normalizedUrl,
          label: cleanLabel,
        })
        .eq("id", linkId)
        .eq("task_id", taskId)
        .select("id, task_id, project_id, url, label, sort_order, created_by, created_at, updated_at")
        .single();

      if (updateError) {
        console.error("Task link edit error:", updateError);
        setError("Could not update link.");
        return;
      }

      cancelEditing();
      if (data) {
        setLinks((prev) => sortLinks(prev.map((item) => (item.id === linkId ? (data as TaskLink) : item))));
      } else {
        await loadLinks();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const deleteLink = async (linkId: string) => {
    if (!canMutateLinks) return;

    setIsSaving(true);
    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from("task_links")
        .delete()
        .eq("id", linkId)
        .eq("task_id", taskId);

      if (deleteError) {
        console.error("Task link delete error:", deleteError);
        setError("Could not delete link.");
        return;
      }

      setLinks((prev) => prev.filter((item) => item.id !== linkId));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className={showHeader ? "space-y-3" : "min-w-0 space-y-3"}>
      {showHeader && (
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            <LinkIcon size={12} />
            Links / References
            {links.length > 0 && (
              <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                {links.length}
              </span>
            )}
          </p>
        </div>
      )}

      {canMutateLinks && (
        <form onSubmit={handleAdd} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-3">
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-[#381a78]"
            disabled={isSaving}
          />
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Optional label"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-[#381a78]"
            disabled={isSaving}
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSaving || !url.trim()}
              className="rounded-lg bg-[#2d1460] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#381a78] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add Link
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          {error}
        </p>
      )}

      <div className="space-y-2">
        {isLoading ? (
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
            <Loader2 size={14} className="animate-spin" />
            Loading links...
          </div>
        ) : links.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
            No links added.
          </div>
        ) : (
          links.map((link) => {
            const isEditing = editingId === link.id;
            return (
              <div key={link.id} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 transition hover:border-slate-200 hover:shadow-sm">
                {isEditing ? (
                  <div className="space-y-2">
                    <input
                      value={editingUrl}
                      onChange={(event) => setEditingUrl(event.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#381a78]"
                      disabled={isSaving}
                    />
                    <input
                      value={editingLabel}
                      onChange={(event) => setEditingLabel(event.target.value)}
                      placeholder="Optional label"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#381a78]"
                      disabled={isSaving}
                    />
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={cancelEditing} className="rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50">
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveEdit(link.id)}
                        disabled={isSaving || !editingUrl.trim()}
                        className="rounded-md bg-[#2d1460] px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50">
                      <ExternalLink size={15} className="text-slate-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-semibold text-slate-900 transition hover:text-blue-700 hover:underline"
                      >
                        {getDisplayLabel(link)}
                      </a>
                      <p className="mt-0.5 break-all text-xs text-blue-600">{link.url}</p>
                    </div>
                    {canMutateLinks && (
                      <div className="flex shrink-0 items-center gap-2">
                        <button type="button" onClick={() => startEditing(link)} className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                          Edit
                        </button>
                        <button type="button" onClick={() => void deleteLink(link.id)} className="rounded-md px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
