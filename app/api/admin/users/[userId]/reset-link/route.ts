import { json, requireAdmin } from "@/lib/adminAuth";

type RouteContext = {
  params: Promise<{ userId: string }>;
};

export async function POST(req: Request, { params }: RouteContext) {
  const { userId } = await params;
  if (!userId) {
    return json({ error: "User id is required." }, 400);
  }

  const context = await requireAdmin(req);
  if (context instanceof Response) {
    return context;
  }

  const { data: targetUser, error: targetError } = await context.adminClient
    .from("users")
    .select("email")
    .eq("id", userId)
    .maybeSingle<{ email: string | null }>();

  if (targetError || !targetUser?.email) {
    return json({ error: "Target user email not found." }, 404);
  }

  const { data, error } = await context.adminClient.auth.admin.generateLink({
    type: "recovery",
    email: targetUser.email,
  });

  if (error) {
    return json({ error: error.message }, 400);
  }

  const actionLink = (data.properties as { action_link?: string } | undefined)?.action_link ?? null;

  return json({ email: targetUser.email, action_link: actionLink });
}
