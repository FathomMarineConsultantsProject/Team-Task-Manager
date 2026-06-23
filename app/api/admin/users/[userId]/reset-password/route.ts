import { randomBytes } from "crypto";
import { json, requireAdmin } from "@/lib/adminAuth";

type RouteContext = {
  params: Promise<{ userId: string }>;
};

const generateTemporaryPassword = () => {
  const token = randomBytes(9).toString("base64url");
  return `FMC-${token}-1a`;
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

  const password = generateTemporaryPassword();
  const { error } = await context.adminClient.auth.admin.updateUserById(userId, {
    password,
  });

  if (error) {
    return json({ error: error.message }, 400);
  }

  return json({ password });
}
