import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  const body = await req.json();
  const { name, email, role, job_role } = body;

  if (!name || !email) {
    return new Response(JSON.stringify({ error: "Name and email are required" }), {
      status: 400,
    });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const password = `${name.split(" ")[0]}@fmc`;

  const { data: authUser, error: authError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (authError) {
    return new Response(JSON.stringify({ error: authError.message }), {
      status: 400,
    });
  }

  const { error: dbError } = await supabaseAdmin.from("users").insert({
    id: authUser.user.id,
    name,
    email,
    system_role: role ?? "user",
    job_role: job_role ?? "",
  });

  if (dbError) {
    return new Response(JSON.stringify({ error: dbError.message }), {
      status: 400,
    });
  }

  return new Response(
    JSON.stringify({
      email,
      password,
    }),
    { status: 200 },
  );
}
