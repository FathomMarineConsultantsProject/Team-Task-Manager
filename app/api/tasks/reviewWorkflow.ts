import { createClient } from "@supabase/supabase-js";

export type TaskStatusKey = "todo" | "in_progress" | "draft_review" | "in_review" | "done";

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const jsonNoStore = (body: unknown, status = 200) =>
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

export function isTaskStatus(value: string): value is TaskStatusKey {
  return ["todo", "in_progress", "draft_review", "in_review", "done"].includes(value);
}
