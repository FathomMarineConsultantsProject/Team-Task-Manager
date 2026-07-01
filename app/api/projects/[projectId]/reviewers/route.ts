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

type ReviewerRow = {
  id: string;
  project_id: string;
  user_id: string;
  created_at: string;
  reviewer:
    | {
        id: string;
        name: string | null;
        email: string | null;
        job_role: string | null;
        avatar_url?: string | null;
      }
    | {
        id: string;
        name: string | null;
        email: string | null;
        job_role: string | null;
        avatar_url?: string | null;
      }[]
    | null;
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

const canViewReviewers = async (
  adminClient: any,
  projectId: string,
  userId: string,
) => {
  const { data: project } = await adminClient
    .from("projects")
    .select("id, owner_id")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) return false;

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

  const typedProject = project as ProjectRow;
  const systemRole = normalizeRole((profile as { system_role: string | null } | null)?.system_role);
  return Boolean(
    typedProject.owner_id === userId ||
    currentMember ||
    systemRole === "admin" ||
    systemRole === "super_admin",
  );
};

const normalizeReviewer = (reviewer: ReviewerRow) => {
  const user = Array.isArray(reviewer.reviewer) ? reviewer.reviewer[0] ?? null : reviewer.reviewer;
  return {
    id: reviewer.id,
    project_id: reviewer.project_id,
    user_id: reviewer.user_id,
    created_at: reviewer.created_at,
    user,
  };
};

export async function GET(req: Request, { params }: RouteContext) {
  try {
    const { projectId } = await params;
    if (!projectId) {
      return json({ error: "Project id is required." }, 400);
    }

    const { authClient, adminClient } = getClients(req);
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user) {
      return json({ error: "You must be signed in to view project reviewers." }, 401);
    }

    if (!(await canViewReviewers(adminClient, projectId, user.id))) {
      return json({ error: "You do not have access to view project reviewers." }, 403);
    }

    const { data: reviewers, error } = await adminClient
      .from("project_reviewers")
      .select("id, project_id, user_id, created_at, reviewer:users!project_reviewers_user_id_fkey(id, name, email, job_role, avatar_url)")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    if (error) {
      return json({ error: error.message }, 500);
    }

    return json({ reviewers: ((reviewers as ReviewerRow[] | null) ?? []).map(normalizeReviewer) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Failed to load project reviewers." }, 500);
  }
}

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const { projectId } = await params;
    const { userId } = (await req.json()) as { userId?: string };

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
      return json({ error: "Only project owners, leads, admins, or super admins can assign reviewers." }, 403);
    }

    const { data: reviewerUser, error: userError } = await adminClient
      .from("users")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (userError || !reviewerUser) {
      return json({ error: "Reviewer user not found." }, 404);
    }

    const { data: existingMember } = await adminClient
      .from("project_members")
      .select("project_id, user_id, role")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!existingMember) {
      return json({ error: "Reviewer must be an existing project member." }, 400);
    }

    const { error: reviewerError } = await adminClient
      .from("project_reviewers")
      .upsert(
        {
          project_id: projectId,
          user_id: userId,
          assigned_by: user.id,
        },
        { onConflict: "project_id,user_id", ignoreDuplicates: true },
      );

    if (reviewerError) {
      return json({ error: reviewerError.message }, 500);
    }

    const { data: reviewer, error: loadReviewerError } = await adminClient
      .from("project_reviewers")
      .select("id, project_id, user_id, created_at, reviewer:users!project_reviewers_user_id_fkey(id, name, email, job_role, avatar_url)")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .single();

    const typedReviewer = reviewer as ReviewerRow | null;
    if (loadReviewerError || !typedReviewer) {
      return json({ error: loadReviewerError?.message ?? "Failed to assign reviewer." }, 500);
    }

    return json({ reviewer: normalizeReviewer(typedReviewer) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Failed to assign project reviewer." }, 500);
  }
}
