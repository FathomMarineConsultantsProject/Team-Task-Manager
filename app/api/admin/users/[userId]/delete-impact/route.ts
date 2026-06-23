import { json, requireAdmin } from "@/lib/adminAuth";
import { computeDeleteUserImpact } from "@/lib/adminUserDeletion";

type RouteContext = {
  params: Promise<{ userId: string }>;
};

export async function GET(req: Request, { params }: RouteContext) {
  const { userId } = await params;
  if (!userId) {
    return json({ error: "User id is required." }, 400);
  }

  const context = await requireAdmin(req);
  if (context instanceof Response) {
    return context;
  }

  if (context.user.id === userId) {
    return json({ error: "You cannot delete your own account." }, 403);
  }

  const { data: targetUser, error: targetError } = await context.adminClient
    .from("users")
    .select("id")
    .eq("id", userId)
    .maybeSingle<{ id: string }>();

  if (targetError) {
    return json({ error: targetError.message }, 500);
  }

  if (!targetUser) {
    return json({ error: "User not found." }, 404);
  }

  try {
    const impact = await computeDeleteUserImpact(context.adminClient, userId);
    return json(impact);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Failed to compute delete impact." }, 500);
  }
}
