import { isAdminRole, json, requireAdmin } from "@/lib/adminAuth";

export async function POST(req: Request) {
  const context = await requireAdmin(req);
  if (context instanceof Response) {
    return context;
  }

  if (!isAdminRole(context.role)) {
    return json({ error: "Admin access is required." }, 403);
  }

  const body = await req.json();
  const { name, email, role, job_role } = body;
  const requestedRole = typeof role === "string" ? role : "user";

  if (!name || !email) {
    return json({ error: "Name and email are required" }, 400);
  }
  if (!["user", "admin"].includes(requestedRole)) {
    return json({ error: "Invalid system role" }, 400);
  }

  const password = `${name.split(" ")[0]}@fmc`;

  const { data: authUser, error: authError } =
    await context.adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (authError) {
    return json({ error: authError.message }, 400);
  }

  const { error: dbError } = await context.adminClient.from("users").insert({
    id: authUser.user.id,
    name,
    email,
    system_role: requestedRole,
    job_role: job_role ?? "",
  });

  if (dbError) {
    return json({ error: dbError.message }, 400);
  }

  return json({ email, password });
}
