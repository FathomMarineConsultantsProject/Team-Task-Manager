import { json, requireAdmin } from "@/lib/adminAuth";

export async function GET(req: Request) {
  const context = await requireAdmin(req);
  if (context instanceof Response) {
    return context;
  }

  const query = context.adminClient
    .from("users")
    .select("id, name, email, job_role, system_role, avatar_url, created_at")
    .order("name", { ascending: true, nullsFirst: false })
    .order("email", { ascending: true, nullsFirst: false });
  const { data, error } = await query;

  if (error) {
    const fallback = await context.adminClient
      .from("users")
      .select("id, name, email, job_role, system_role, avatar_url")
      .order("name", { ascending: true, nullsFirst: false })
      .order("email", { ascending: true, nullsFirst: false });

    if (fallback.error) {
      return json({ error: fallback.error.message }, 500);
    }

    return json({ users: fallback.data ?? [] });
  }

  return json({ users: data ?? [] });
}
