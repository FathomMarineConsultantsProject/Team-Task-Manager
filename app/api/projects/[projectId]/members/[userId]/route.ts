import { createClient } from "@supabase/supabase-js";

type RouteContext = {
  params: Promise<{ projectId: string; userId: string }>;
};

type ProjectRow = {
  id: string;
  owner_id: string | null;
};

type MemberRow = {
  project_id: string;
  user_id: string;
  role: string | null;
};

type TaskIdRow = {
  id: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const normalizeRole = (role: string | null | undefined) => (role ?? "").toLowerCase();

const getClients = (req: Request) => {
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
};

export async function DELETE(req: Request, { params }: RouteContext) {
  try {
    const { projectId, userId } = await params;

    if (!projectId) {
      return json({ error: "Project id is required." }, 400);
    }

    if (!userId) {
      return json({ error: "Target user id is required." }, 400);
    }

    const { authClient, adminClient } = getClients(req);
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user) {
      return json({ error: "You must be signed in to manage project members." }, 401);
    }

    const { data: project, error: projectError } = await adminClient
      .from("projects")
      .select("id, owner_id")
      .eq("id", projectId)
      .single<ProjectRow>();

    if (projectError || !project) {
      return json({ error: "Project not found." }, 404);
    }

    const { data: profile } = await adminClient
      .from("users")
      .select("system_role")
      .eq("id", user.id)
      .maybeSingle<{ system_role: string | null }>();

    const systemRole = normalizeRole(profile?.system_role);
    const isAdmin = systemRole === "admin";
    const isSuperAdmin = systemRole === "super_admin";

    if (!isAdmin && !isSuperAdmin) {
      return json({ error: "Only admins can remove project members." }, 403);
    }

    if (project.owner_id === userId) {
      return json({ error: "Project owner cannot be removed. Transfer ownership first." }, 400);
    }

    const { data: targetMember, error: targetError } = await adminClient
      .from("project_members")
      .select("project_id, user_id, role")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .maybeSingle<MemberRow>();

    if (targetError || !targetMember) {
      return json({ error: "Target user is not a member of this project." }, 404);
    }

    if (user.id === userId) {
      const { data: leadRows, error: leadRowsError } = await adminClient
        .from("project_members")
        .select("project_id, user_id, role")
        .eq("project_id", projectId)
        .eq("role", "lead");

      if (leadRowsError) {
        return json({ error: leadRowsError.message }, 500);
      }

      const remainingLeadCount = ((leadRows as MemberRow[] | null) ?? []).filter((member) => member.user_id !== userId).length;
      const hasOwnerManager = Boolean(project.owner_id && project.owner_id !== userId);

      if (!hasOwnerManager && remainingLeadCount === 0) {
        return json({ error: "You cannot remove yourself as the only remaining project manager." }, 400);
      }
    }

    const { data: taskRows, error: taskRowsError } = await adminClient
      .from("tasks")
      .select("id")
      .eq("project_id", projectId);

    if (taskRowsError) {
      return json({ error: taskRowsError.message }, 500);
    }

    const taskIds = ((taskRows as TaskIdRow[] | null) ?? []).map((task) => task.id);

    const { error: unassignPrimaryError } = await adminClient
      .from("tasks")
      .update({ assigned_to: null })
      .eq("project_id", projectId)
      .eq("assigned_to", userId);

    if (unassignPrimaryError) {
      return json({ error: unassignPrimaryError.message }, 500);
    }

    if (taskIds.length > 0) {
      const { error: unassignAdditionalError } = await adminClient
        .from("task_assignees")
        .delete()
        .eq("user_id", userId)
        .in("task_id", taskIds);

      if (unassignAdditionalError) {
        return json({ error: unassignAdditionalError.message }, 500);
      }
    }

    const { error: deleteMemberError } = await adminClient
      .from("project_members")
      .delete()
      .eq("project_id", projectId)
      .eq("user_id", userId);

    if (deleteMemberError) {
      return json({ error: deleteMemberError.message }, 500);
    }

    return json({ success: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Failed to remove project member." }, 500);
  }
}
