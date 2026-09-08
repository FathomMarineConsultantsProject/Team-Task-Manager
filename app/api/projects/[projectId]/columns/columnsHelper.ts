import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { ColumnColorKey } from "@/lib/columnColors";

export type BoardColumnRow = {
  id: string;
  project_id: string;
  title: string;
  sort_order: number;
  stage_type: "todo" | "in_progress" | "draft_review" | "in_review" | "done" | "custom";
  status_key: "todo" | "in_progress" | "draft_review" | "in_review" | "done";
  is_locked: boolean;
  color_key: ColumnColorKey;
  track_man_hours: boolean;
  created_at: string;
  updated_at: string;
};

export const DEFAULT_COLUMNS = [
  { title: "TO DO", sort_order: 0, stage_type: "todo", status_key: "todo", is_locked: true, color_key: "slate", track_man_hours: false },
  { title: "IN PROGRESS", sort_order: 1, stage_type: "in_progress", status_key: "in_progress", is_locked: false, color_key: "blue", track_man_hours: true },
  { title: "DRAFT REVIEW", sort_order: 2, stage_type: "draft_review", status_key: "draft_review", is_locked: false, color_key: "cyan", track_man_hours: true },
  { title: "IN REVIEW", sort_order: 3, stage_type: "in_review", status_key: "in_review", is_locked: false, color_key: "amber", track_man_hours: true },
  { title: "DONE", sort_order: 4, stage_type: "done", status_key: "done", is_locked: false, color_key: "green", track_man_hours: false },
] as const;

export const normalizeRole = (role: string | null | undefined) => (role ?? "").toLowerCase();

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

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

export async function canManageColumns(
  adminClient: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<boolean> {
  const { data: project } = await adminClient
    .from("projects")
    .select("id, owner_id")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) return false;

  if (project.owner_id === userId) return true;

  const { data: profile } = await adminClient
    .from("users")
    .select("system_role")
    .eq("id", userId)
    .maybeSingle();

  const systemRole = normalizeRole(profile?.system_role);
  if (systemRole === "admin" || systemRole === "super_admin") return true;

  const { data: member } = await adminClient
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  const memberRole = normalizeRole(member?.role);
  if (memberRole === "lead" || memberRole === "owner") return true;

  return false;
}

export async function canViewColumns(
  adminClient: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<boolean> {
  const { data: project } = await adminClient
    .from("projects")
    .select("id, owner_id")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) return false;
  if (project.owner_id === userId) return true;

  const { data: profile } = await adminClient
    .from("users")
    .select("system_role")
    .eq("id", userId)
    .maybeSingle();

  const systemRole = normalizeRole(profile?.system_role);
  if (systemRole === "admin" || systemRole === "super_admin") return true;

  const { data: member } = await adminClient
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  return Boolean(member);
}

export async function ensureDefaultColumns(
  adminClient: SupabaseClient,
  projectId: string,
): Promise<BoardColumnRow[]> {
  const { data: existing, error: selectError } = await adminClient
    .from("project_board_columns")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });

  if (selectError) {
    throw new Error(selectError.message);
  }

  if (existing && existing.length > 0) {
    return existing as BoardColumnRow[];
  }

  // Provision the 5 standard columns
  const toInsert = DEFAULT_COLUMNS.map((col) => ({
    project_id: projectId,
    title: col.title,
    sort_order: col.sort_order,
    stage_type: col.stage_type,
    status_key: col.status_key,
    is_locked: col.is_locked,
  }));

  const { data: inserted, error: insertError } = await adminClient
    .from("project_board_columns")
    .insert(toInsert)
    .select("*")
    .order("sort_order", { ascending: true });

  if (insertError) {
    throw new Error(insertError.message);
  }

  return (inserted ?? []) as BoardColumnRow[];
}
