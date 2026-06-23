import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export type AdminRole = "user" | "admin";

export type AdminContext = {
  user: User;
  profile: {
    id: string;
    system_role: string | null;
  };
  role: AdminRole;
  authClient: SupabaseClient;
  adminClient: SupabaseClient;
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const normalizeRole = (role: string | null | undefined): AdminRole => {
  const value = (role ?? "").toLowerCase();
  if (value === "admin") return "admin";
  return "user";
};

export const isAdminRole = (role: AdminRole) => role === "admin";

export const getAdminContext = async (req: Request): Promise<AdminContext | Response> => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Supabase server configuration is missing." }, 500);
  }

  const authorization = req.headers.get("authorization") ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return json({ error: "Authorization bearer token is required." }, 401);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError || !user) {
    return json({ error: "You must be signed in." }, 401);
  }

  const { data: profile, error: profileError } = await adminClient
    .from("users")
    .select("id, system_role")
    .eq("id", user.id)
    .maybeSingle<{ id: string; system_role: string | null }>();

  if (profileError || !profile) {
    return json({ error: "User profile not found." }, 403);
  }

  return {
    user,
    profile,
    role: normalizeRole(profile.system_role),
    authClient,
    adminClient,
  };
};

export const requireAdmin = async (req: Request): Promise<AdminContext | Response> => {
  const context = await getAdminContext(req);
  if (context instanceof Response) return context;
  if (!isAdminRole(context.role)) {
    return json({ error: "Admin access is required." }, 403);
  }
  return context;
};
