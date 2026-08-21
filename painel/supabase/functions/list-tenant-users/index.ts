// Edge Function: lista os logins vinculados ao MESMO tenant de quem chamou,
// com o e-mail de cada um (auth.users nao e legivel numa query normal, so
// pelo Admin API -- por isso precisa dessa function em vez de uma query
// direta do painel).
//
// Deploy: Project > Edge Functions > Deploy a new function, colar este
// arquivo inteiro. Mesma checagem de seguranca de create-tenant-user.

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

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: members, error: membersErr } = await admin
      .from("tenant_users")
      .select("user_id, role, created_at")
      .eq("tenant_id", tenantRow.tenant_id)
      .order("created_at", { ascending: true });

    if (membersErr) return json({ error: membersErr.message }, 400);

    const users = await Promise.all(
      (members || []).map(async (m) => {
        const { data: u } = await admin.auth.admin.getUserById(m.user_id);
        return {
          userId: m.user_id,
          email: u?.user?.email || "(desconhecido)",
          role: m.role,
          addedAt: m.created_at,
          isSelf: m.user_id === userData.user.id,
        };
      })
    );

    return json({ users });
  } catch (err) {
    return json({ error: (err as Error).message || "Erro inesperado." }, 500);
  }
});
