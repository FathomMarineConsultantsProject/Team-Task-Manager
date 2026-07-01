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

const canManageReviewers = async (
  adminClient: any,
  projectId: string,
  userId: string,
  project: ProjectRow,
) => {
  const { data: profile } = await adminClient
    .from("users")
    .select("system_role")
    .eq("id", userId)
    .maybeSingle();

  const { data: currentMember } = await adminClient
    .from("project_members")
    .select("project_id, user_id, role")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  const systemRole = normalizeRole((profile as { system_role: string | null } | null)?.system_role);
  return (
    project.owner_id === userId ||
    normalizeRole((currentMember as MemberRow | null)?.role) === "lead" ||
    systemRole === "admin" ||
    systemRole === "super_admin"
  );
};

export async function DELETE(req: Request, { params }: RouteContext) {
  try {
    const { projectId, userId } = await params;

    if (!projectId) {
      return json({ error: "Project id is required." }, 400);
    }

    if (!userId) {
      return json({ error: "Reviewer user id is required." }, 400);
    }

    const { authClient, adminClient } = getClients(req);
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user) {
      return json({ error: "You must be signed in to manage project reviewers." }, 401);
    }

    const { data: project, error: projectError } = await adminClient
      .from("projects")
      .select("id, owner_id")
      .eq("id", projectId)
      .single();

    const typedProject = project as ProjectRow | null;
    if (projectError || !typedProject) {
      return json({ error: "Project not found." }, 404);
    }

    if (!(await canManageReviewers(adminClient, projectId, user.id, typedProject))) {
      return json({ error: "Only project owners, leads, admins, or super admins can remove reviewers." }, 403);
    }

    const { error } = await adminClient
      .from("project_reviewers")
      .delete()
      .eq("project_id", projectId)
      .eq("user_id", userId);

    if (error) {
      return json({ error: error.message }, 500);
    }

    return json({ success: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Failed to remove project reviewer." }, 500);
  }
}
