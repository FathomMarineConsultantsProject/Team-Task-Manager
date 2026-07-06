import { createClient } from "@supabase/supabase-js";

export const REVIEW_GATE_ERROR = "All assigned reviewers must complete their review before this task can be moved to Done.";

export type TaskStatusKey = "todo" | "in_progress" | "draft_review" | "in_review" | "done";

export type TaskStatusRow = {
  id: string;
  project_id: string;
  status: string | null;
  draft_review_started_at?: string | null;
  draft_review_due_at?: string | null;
};

export type ProjectRow = {
  id: string;
  owner_id: string | null;
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const normalizeRole = (role: string | null | undefined) => (role ?? "").toLowerCase();

export function getClients(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error("Supabase server configuration is missing.");
  }

  const authorization = req.headers.get("authorization") ?? "";
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  return { authClient, adminClient };
}

export async function getAuthenticatedUser(req: Request) {
  const { authClient, adminClient } = getClients(req);
  const {
    data: { user },
    error,
  } = await authClient.auth.getUser();

  if (error || !user) {
    return { user: null, adminClient };
  }

  return { user, adminClient };
}

export function isTaskStatus(value: string): value is TaskStatusKey {
  return ["todo", "in_progress", "draft_review", "in_review", "done"].includes(value);
}

export async function resetTaskReviewCycle(adminClient: any, taskId: string, projectId: string) {
  const { error: deleteError } = await adminClient
    .from("task_reviewer_reviews")
    .delete()
    .eq("task_id", taskId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  const { data: reviewers, error: reviewersError } = await adminClient
    .from("project_reviewers")
    .select("user_id")
    .eq("project_id", projectId);

  if (reviewersError) {
    throw new Error(reviewersError.message);
  }

  const rows = ((reviewers as { user_id: string | null }[] | null) ?? [])
    .filter((reviewer): reviewer is { user_id: string } => Boolean(reviewer.user_id))
    .map((reviewer) => ({
      task_id: taskId,
      project_id: projectId,
      reviewer_id: reviewer.user_id,
      status: "pending",
      reviewed_at: null,
    }));

  if (rows.length === 0) {
    return { insertedCount: 0 };
  }

  const { error: insertError } = await adminClient.from("task_reviewer_reviews").insert(rows);
  if (insertError) {
    throw new Error(insertError.message);
  }

  return { insertedCount: rows.length };
}

export async function loadPendingReviewers(adminClient: any, taskId: string) {
  const { data, error } = await adminClient
    .from("task_reviewer_reviews")
    .select("id, reviewer_id, status, reviewer:users!task_reviewer_reviews_reviewer_id_fkey(id, name, email)")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data as Array<{
    reviewer_id: string;
    status: string | null;
    reviewer:
      | { id: string; name: string | null; email: string | null }
      | { id: string; name: string | null; email: string | null }[]
      | null;
  }> | null) ?? [];

  const pending = rows.filter((row) => row.status !== "reviewed");
  return {
    totalCount: rows.length,
    pendingReviewerIds: pending.map((row) => row.reviewer_id),
    pendingReviewers: pending
      .map((row) => {
        const reviewer = Array.isArray(row.reviewer) ? row.reviewer[0] ?? null : row.reviewer;
        return reviewer?.name || reviewer?.email || "";
      })
      .filter(Boolean),
  };
}
