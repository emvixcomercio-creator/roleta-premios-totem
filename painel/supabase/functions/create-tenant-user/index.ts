// Edge Function: cria um novo login e vincula ao MESMO tenant de quem chamou.
// Só pode ser deployada dentro do proprio projeto Supabase (Project > Edge
// Functions > Deploy a new function) -- cole este arquivo inteiro la.
//
// Seguranca: a service role key (admin.*) SO e usada depois de confirmar,
// com o token de quem chamou, que essa pessoa ja pertence a um tenant. Sem
// essa checagem primeiro, qualquer um que descobrisse a URL da function
// poderia criar usuarios em qualquer tenant.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autenticado." }, 401);

    // client com o token de quem chamou -- roda sob RLS normal, so pra
    // confirmar quem e essa pessoa e a qual tenant ela pertence.
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "Sessão inválida." }, 401);
    }

    const { data: tenantRow, error: tenantErr } = await callerClient
      .from("tenant_users")
      .select("tenant_id")
      .eq("user_id", userData.user.id)
      .limit(1)
      .single();

    if (tenantErr || !tenantRow) {
      return json({ error: "Você não está vinculado a nenhuma conta." }, 403);
    }

    const body = await req.json().catch(() => null);
    const email = body?.email?.trim();
    const password = body?.password;

    if (!email || !password) {
      return json({ error: "E-mail e senha são obrigatórios." }, 400);
    }
    if (password.length < 6) {
      return json({ error: "A senha precisa ter pelo menos 6 caracteres." }, 400);
    }

    // daqui pra baixo, ja confirmado o tenant -- pode usar a chave admin.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr || !created?.user) {
      return json({ error: createErr?.message || "Não foi possível criar o usuário." }, 400);
    }

    const { error: linkErr } = await admin.from("tenant_users").insert({
      tenant_id: tenantRow.tenant_id,
      user_id: created.user.id,
      role: "member",
    });
    if (linkErr) {
      return json({ error: linkErr.message }, 400);
    }

    return json({ ok: true, userId: created.user.id });
  } catch (err) {
    return json({ error: (err as Error).message || "Erro inesperado." }, 500);
  }
});
