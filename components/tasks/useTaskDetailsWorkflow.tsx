"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Modal from "@/components/ui/modal";
import ChatPanel from "@/components/ui/ChatPanel";
import TaskAttachments from "@/components/tasks/TaskAttachments";

export type TaskDetailsSeed = {
  id: string;
  projectId: string;
  title: string;
  status: string;
  assignee?: string;
  assignees?: { id: string; name: string | null; email?: string | null }[];
  createdAt?: string | null;
  createdByName?: string | null;
  projectName: string;
  startDate?: string | null;
  endDate?: string | null;
  creator?: { id: string | null; name: string | null; email: string | null } | null;
  description?: string | null;
};

type TaskDetailsState = Required<Omit<TaskDetailsSeed, "assignees" | "assignee" | "createdAt" | "createdByName" | "startDate" | "endDate" | "creator" | "description">> & {
  assignee: string;
  assignees: { id: string; name: string | null; email?: string | null }[];
  createdAt: string | null;
  createdByName: string | null;
  startDate: string | null;
  endDate: string | null;
  creator: { id: string | null; name: string | null; email: string | null } | null;
  description: string | null;
  /** The user ID who created this task (loaded from DB) */
  createdById: string | null;
};

type TaskDetailsRow = {
  created_by: string | null;
  description: string | null;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  project_id: string | null;
};

type TaskLogRow = {
  id: string;
  action: string;
  from_status: string | null;
  to_status: string | null;
  created_at: string;
  user_id: string;
};

type TaskLogEntry = TaskLogRow & {
  user: { id: string | null; name: string | null; email: string | null } | null;
};

type TaskUpdateRow = {
  id: string;
  content: string | null;
  created_at: string;
  user_id: string;
  task_id: string | null;
  project_id: string | null;
  reply_to: string | null;
  users:
    | {
        id: string;
        name: string | null;
        email: string | null;
        avatar_url: string | null;
        job_role: string | null;
      }
    | {
        id: string;
        name: string | null;
        email: string | null;
        avatar_url: string | null;
        job_role: string | null;
      }[]
    | null;
};

type TaskUpdateEntry = {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  task_id: string;
  project_id: string;
  reply_to: string | null;
  user: { id: string; name: string | null; email: string | null; avatar_url: string | null } | null;
};

type TaskDetailMember = { user_id: string; user: { id: string; name: string | null; email: string | null; avatar_url?: string | null } | null };

type ProjectMemberRow = {
  user_id: string | null;
  user:
    | {
        id: string;
        name: string | null;
        email: string | null;
        avatar_url?: string | null;
      }
    | {
        id: string;
        name: string | null;
        email: string | null;
        avatar_url?: string | null;
      }[]
    | null;
};

type SupabaseClient = {
  from: (table: string) => any;
  storage: { from: (bucket: string) => any };
};

type WorkflowOptions = {
  supabase: SupabaseClient;
  profileId: string | null;
  members: TaskDetailMember[];
  /** The owner_id of the project (used for attachment permissions) */
  projectOwnerId?: string | null;
  /** Whether the current user is an admin/super_admin */
  isAdmin?: boolean;
};

const formatDateLabel = (value: string | null | undefined) => {
  if (!value) {
    return "N/A";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
};

const formatOptionalDate = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
};

const formatStatusValue = (value: string | null | undefined) => {
  if (!value) {
    return "UNKNOWN";
  }

  return value.replace(/_/g, " ").toUpperCase();
};

const formatLogDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const describeLog = (log: TaskLogEntry) => {
  if (log.action === "moved") {
    return `Moved from ${formatStatusValue(log.from_status)} -> ${formatStatusValue(log.to_status)}`;
  }

  if (log.action === "assigned") {
    return "Assigned task";
  }

  if (log.action === "created") {
    return "Task created";
  }

  return "Task updated";
};

export function useTaskDetailsWorkflow({ supabase, profileId, members, projectOwnerId, isAdmin }: WorkflowOptions) {
  const [selectedTaskDetails, setSelectedTaskDetails] = useState<TaskDetailsState | null>(null);
  const [taskLogs, setTaskLogs] = useState<TaskLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [taskUpdates, setTaskUpdates] = useState<TaskUpdateEntry[]>([]);
  const [projectMembers, setProjectMembers] = useState<TaskDetailMember[]>([]);
  const [isSubmittingUpdate, setIsSubmittingUpdate] = useState(false);
  const [isTitleExpanded, setIsTitleExpanded] = useState(false);
  const taskId = selectedTaskDetails?.id ?? null;
  const projectId = selectedTaskDetails?.projectId ?? null;
  const chatMembers = useMemo(() => {
    const merged = new Map<string, TaskDetailMember>();
    [...projectMembers, ...members].forEach((member) => {
      if (member.user_id) {
        merged.set(member.user_id, member);
      }
    });
    return [...merged.values()];
  }, [members, projectMembers]);

  // ---- Attachment permission computation ----
  const attachmentPermissions = useMemo(() => {
    if (!profileId || !selectedTaskDetails) {
      return { canUpload: false, canDeleteAll: false };
    }

    const isProjectOwner = Boolean(projectOwnerId && projectOwnerId === profileId);
    const isProjectLead = isProjectOwner; // In this app, project owner = lead
    const isTaskCreator = Boolean(selectedTaskDetails.createdById && selectedTaskDetails.createdById === profileId);
    const isTaskAssignee =
      selectedTaskDetails.assignees?.some((a) => a.id === profileId) ?? false;
    const isAdminUser = isAdmin ?? false;

    // Upload: Project Owner, Project Lead, Task Creator, Task Assignee
    const canUpload = isProjectOwner || isProjectLead || isTaskCreator || isTaskAssignee || isAdminUser;

    // Delete all: Project Owner, Project Lead (uploader can always delete their own — handled in component)
    const canDeleteAll = isProjectOwner || isProjectLead || isAdminUser;

    return { canUpload, canDeleteAll };
  }, [profileId, selectedTaskDetails, projectOwnerId, isAdmin]);

  const closeTaskDetails = useCallback(() => {
    setSelectedTaskDetails(null);
    setIsTitleExpanded(false);
  }, []);

  const openTaskDetails = useCallback((seed: TaskDetailsSeed) => {
    setSelectedTaskDetails({
      id: seed.id,
      projectId: seed.projectId,
      title: seed.title,
      status: seed.status,
      assignee: seed.assignee ?? "Unassigned",
      assignees: seed.assignees ?? [],
      createdAt: seed.createdAt ?? null,
      createdByName: seed.createdByName ?? null,
      projectName: seed.projectName,
      startDate: seed.startDate ?? null,
      endDate: seed.endDate ?? null,
      creator: seed.creator ?? null,
      description: seed.description ?? null,
      createdById: null, // Will be loaded from DB
    });
  }, []);

  const loadTaskLogs = useCallback(async () => {
    try {
      setLogsLoading(true);

      if (!taskId) {
        setTaskLogs([]);
        return;
      }

      const { data: taskData, error: taskError } = await supabase
        .from("tasks")
        .select("created_by, description, title, start_date, end_date, project_id")
        .eq("id", taskId)
        .single();

      if (taskError) {
        console.error("Task details error:", taskError);
      }

      const taskDetails = (taskData as TaskDetailsRow | null) ?? null;
      let createdByName = "Unknown";

      if (taskDetails?.created_by) {
        const { data: creator } = await supabase
          .from("users")
          .select("name")
          .eq("id", taskDetails.created_by)
          .single();

        if (creator) {
          createdByName = ((creator as { name: string | null }).name ?? "Unknown") || "Unknown";
        }
      }

      setSelectedTaskDetails((prev) => {
        if (!prev || prev.id !== taskId) {
          return prev;
        }

        return {
          ...prev,
          createdByName: createdByName || prev.createdByName,
          creator: {
            id: null,
            name: createdByName,
            email: null,
          },
          description: taskDetails?.description ?? prev.description,
          title: taskDetails?.title ?? prev.title,
          startDate: taskDetails?.start_date ?? prev.startDate,
          endDate: taskDetails?.end_date ?? prev.endDate,
          projectId: taskDetails?.project_id ?? prev.projectId,
          createdById: taskDetails?.created_by ?? prev.createdById,
        };
      });

      const { data: logsData, error: logsError } = await supabase
        .from("task_logs")
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false });

      if (logsError) {
        console.error("Task logs error:", logsError);
        setTaskLogs([]);
        return;
      }

      if (!logsData || logsData.length === 0) {
        setTaskLogs([]);
        return;
      }

      const userIds = [...new Set((logsData as TaskLogRow[]).map((log) => log.user_id).filter(Boolean))];
      let usersMap: Record<string, { id: string; name: string | null; email: string | null }> = {};

      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from("users")
          .select("id, name, email")
          .in("id", userIds as string[]);

        const safeUsers = (users as { id: string; name: string | null; email: string | null }[] | null) || [];
        usersMap = Object.fromEntries(safeUsers.map((u) => [u.id, u]));
      }

      const enrichedLogs = (logsData as TaskLogRow[]).map((log) => ({
        ...log,
        user: (log.user_id && usersMap[log.user_id]) || null,
      }));

      setTaskLogs(enrichedLogs);
    } catch (err) {
      console.error("Unexpected logs error:", err);
      setTaskLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }, [supabase, taskId]);

  useEffect(() => {
    if (taskId) {
      void loadTaskLogs();
    }
  }, [taskId, loadTaskLogs]);

  useEffect(() => {
    let isMounted = true;

    const loadProjectMembers = async () => {
      if (!projectId || members.length > 0) {
        if (isMounted) {
          setProjectMembers([]);
        }
        return;
      }

      const { data, error } = await supabase
        .from("project_members")
        .select("user_id, user:users(id, name, email, avatar_url)")
        .eq("project_id", projectId);

      if (error) {
        if (isMounted) {
          setProjectMembers([]);
        }
        return;
      }

      const normalized = ((data as ProjectMemberRow[] | null | undefined) ?? [])
        .map((member) => {
          const user = Array.isArray(member.user) ? member.user[0] ?? null : member.user ?? null;
          return {
            user_id: member.user_id ?? user?.id ?? "",
            user,
          };
        })
        .filter((member): member is TaskDetailMember => Boolean(member.user_id));

      if (isMounted) {
        setProjectMembers(normalized);
      }
    };

    void loadProjectMembers();

    return () => {
      isMounted = false;
    };
  }, [members.length, projectId, supabase]);

  const loadTaskUpdates = useCallback(async () => {
    try {
      if (!taskId) {
        setTaskUpdates([]);
        return;
      }

      const { data: updatesData, error: updatesError } = await supabase
        .from("task_updates")
        .select(
          `
            id,
            content,
            created_at,
            user_id,
            task_id,
            project_id,
            reply_to,
            users (
              id,
              name,
              email,
              avatar_url,
              job_role
            )
          `,
        )
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });

      if (updatesError) {
        setTaskUpdates([]);
        return;
      }

      const normalized = ((updatesData as TaskUpdateRow[] | null | undefined) ?? []).map((update) => {
        const userRelation = Array.isArray(update.users) ? update.users[0] ?? null : update.users ?? null;
        return {
          id: update.id,
          content: update.content ?? "",
          created_at: update.created_at,
          user_id: update.user_id ?? "",
          task_id: update.task_id ?? taskId,
          project_id: update.project_id ?? selectedTaskDetails?.projectId ?? "",
          reply_to: update.reply_to ?? null,
          user: userRelation
            ? {
                id: userRelation.id,
                name: userRelation.name,
                email: userRelation.email,
                avatar_url: userRelation.avatar_url,
              }
            : null,
        };
      });

      setTaskUpdates(normalized);
    } catch {
      setTaskUpdates([]);
    }
  }, [supabase, taskId, selectedTaskDetails?.projectId]);

  useEffect(() => {
    if (taskId) {
      void loadTaskUpdates();
      return;
    }

    setTaskUpdates([]);
  }, [taskId, loadTaskUpdates]);

  const handleCreateUpdate = useCallback(
    async (content: string) => {
      if (!selectedTaskDetails || !profileId) return;
      setIsSubmittingUpdate(true);
      try {
        await supabase.from("task_updates").insert({
          task_id: selectedTaskDetails.id,
          project_id: selectedTaskDetails.projectId,
          user_id: profileId,
          content,
        });
        await loadTaskUpdates();
      } finally {
        setIsSubmittingUpdate(false);
      }
    },
    [loadTaskUpdates, profileId, selectedTaskDetails, supabase],
  );

  const handleEditUpdate = useCallback(
    async (id: string, content: string) => {
      setIsSubmittingUpdate(true);
      try {
        await supabase.from("task_updates").update({ content }).eq("id", id);
        await loadTaskUpdates();
      } finally {
        setIsSubmittingUpdate(false);
      }
    },
    [loadTaskUpdates, supabase],
  );

  const handleDeleteUpdate = useCallback(
    async (id: string) => {
      setIsSubmittingUpdate(true);
      try {
        await supabase.from("task_updates").delete().eq("id", id);
        await loadTaskUpdates();
      } finally {
        setIsSubmittingUpdate(false);
      }
    },
    [loadTaskUpdates, supabase],
  );

  const handleReply = useCallback(
    async (parentId: string, content: string) => {
      if (!selectedTaskDetails || !profileId) return;
      setIsSubmittingUpdate(true);
      try {
        await supabase.from("task_updates").insert({
          task_id: selectedTaskDetails.id,
          project_id: selectedTaskDetails.projectId,
          user_id: profileId,
          content,
          reply_to: parentId,
        });
        await loadTaskUpdates();
      } finally {
        setIsSubmittingUpdate(false);
      }
    },
    [loadTaskUpdates, profileId, selectedTaskDetails, supabase],
  );

  const renderTaskDetails = () => (
    <>
      <Modal title="Task Details" isOpen={Boolean(selectedTaskDetails)} onClose={closeTaskDetails}>
        {selectedTaskDetails && (
          <div className="space-y-5 text-sm text-slate-700">
            <div className="space-y-2">
              <div className="min-w-0">
                <p
                  className={`text-xl font-bold leading-tight text-slate-900 break-words cursor-pointer transition-all ${
                    isTitleExpanded ? "" : "line-clamp-2"
                  }`}
                  onClick={() => setIsTitleExpanded((v) => !v)}
                  title={isTitleExpanded ? "Click to collapse" : "Click to expand full title"}
                >
                  {selectedTaskDetails.title}
                </p>
                {selectedTaskDetails.title.length > 80 && (
                  <button
                    type="button"
                    onClick={() => setIsTitleExpanded((v) => !v)}
                    className="mt-0.5 text-[11px] font-medium text-blue-500 hover:text-blue-700 transition"
                  >
                    {isTitleExpanded ? "Show less" : "Show more"}
                  </button>
                )}
                <p className="mt-1 text-xs uppercase tracking-[0.15em] text-slate-500">
                  {selectedTaskDetails.status}
                </p>
              </div>

              {selectedTaskDetails.description && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400">Description</p>
                  <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">
                    {selectedTaskDetails.description}
                  </p>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400 mb-1">Assigned To</p>
                {(() => {
                  const assignees = selectedTaskDetails.assignees ?? [];
                  if (assignees.length === 0) return <p className="text-sm text-slate-600">Unassigned</p>;
                  const names = assignees.map((u) => u.name || "Unknown");
                  const display = names.length <= 2 ? names.join(", ") : `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
                  return (
                    <p className="text-sm text-slate-600" title={names.join(", ")}>
                      {display}
                    </p>
                  );
                })()}
              </div>

              <p className="text-xs text-slate-500">Created: {formatDateLabel(selectedTaskDetails.createdAt)}</p>
              {selectedTaskDetails.startDate && (
                <div>
                  <p className="text-xs text-gray-500">Start Date</p>
                  <p className="text-sm">{formatOptionalDate(selectedTaskDetails.startDate)}</p>
                </div>
              )}
              {selectedTaskDetails.endDate && (
                <div>
                  <p className="text-xs text-gray-500">Due Date</p>
                  <p className="text-sm">{formatOptionalDate(selectedTaskDetails.endDate)}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">Created by</p>
                  <p className="mt-1 text-slate-900">{selectedTaskDetails.createdByName || "Unknown"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">Project</p>
                  <p className="mt-1 text-slate-900">{selectedTaskDetails.projectName}</p>
                </div>
              </div>
            </div>

            {/* Attachments — with permissions */}
            <TaskAttachments
              supabase={supabase}
              taskId={selectedTaskDetails.id}
              profileId={profileId}
              canUpload={attachmentPermissions.canUpload}
              canDeleteAll={attachmentPermissions.canDeleteAll}
            />

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Activity Timeline</p>
              <div className="mt-3 max-h-[200px] overflow-y-auto pr-2 space-y-0">
                {logsLoading ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                    Loading activity...
                  </div>
                ) : taskLogs.length === 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                    No activity yet
                  </div>
                ) : (
                  taskLogs.map((log, index) => (
                    <div key={log.id} className="relative pl-7 pb-4">
                      <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full bg-slate-400" />
                      {index < taskLogs.length - 1 && <span className="absolute left-[4px] top-4 h-full w-px bg-slate-200" />}
                      <p className="mt-1 text-sm text-slate-800">{describeLog(log)}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {log.user?.name || log.user?.email || "Unknown"} - {formatLogDate(log.created_at)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ChatPanel
        isOpen={Boolean(selectedTaskDetails)}
        onClose={closeTaskDetails}
        taskTitle={selectedTaskDetails?.title ?? ""}
        taskUpdates={taskUpdates}
        members={chatMembers}
        profileId={profileId}
        canAddUpdate={true}
        canViewUpdates={true}
        isProjectOwnerMember={true}
        isSuperAdmin={true}
        onCreateUpdate={handleCreateUpdate}
        onEditUpdate={handleEditUpdate}
        onDeleteUpdate={(id) => {
          void handleDeleteUpdate(id);
        }}
        onReply={handleReply}
        isSavingUpdate={isSubmittingUpdate}
      />
    </>
  );

  return {
    openTaskDetails,
    closeTaskDetails,
    selectedTaskDetails,
    renderTaskDetails,
  };
}
