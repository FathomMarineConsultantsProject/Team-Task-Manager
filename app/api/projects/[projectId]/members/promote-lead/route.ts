import { createClient } from "@supabase/supabase-js";

type RouteContext = {
  params: Promise<{ projectId: string }>;
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

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const { projectId } = await params;
    const { userId } = (await req.json()) as { userId?: string };

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

    const { data: currentMember } = await adminClient
      .from("project_members")
      .select("project_id, user_id, role")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .maybeSingle<MemberRow>();

    const systemRole = normalizeRole(profile?.system_role);
    const isOwner = project.owner_id === user.id;
    const isProjectLead = normalizeRole(currentMember?.role) === "lead";
    const isAdmin = systemRole === "admin";
    const isSuperAdmin = systemRole === "super_admin";

    if (!isOwner && !isProjectLead && !isAdmin && !isSuperAdmin) {
      return json({ error: "Only project owners, leads, admins, or super admins can promote project leads." }, 403);
    }

    if (project.owner_id === userId) {
      return json({ error: "Project owner is already a project manager." }, 400);
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

    if (normalizeRole(targetMember.role) === "lead") {
      return json({ member: targetMember, message: "Member is already a project lead." });
    }

    const { data: updatedMember, error: updateError } = await adminClient
      .from("project_members")
      .update({ role: "lead" })
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .select("project_id, user_id, role")
      .single<MemberRow>();

    if (updateError || !updatedMember) {
      return json({ error: updateError?.message ?? "Failed to promote member to project lead." }, 500);
    }

    return json({ member: updatedMember });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Failed to promote project lead." }, 500);
  }
}
