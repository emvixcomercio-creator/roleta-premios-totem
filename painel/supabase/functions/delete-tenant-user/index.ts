// Edge Function: remove um login vinculado ao MESMO tenant de quem chamou.
// Deploy: Project > Edge Functions > Deploy a new function, colar este
// arquivo inteiro. Mesma checagem de seguranca de create-tenant-user.
//
// Duas travas alem da checagem de tenant:
// 1) ninguem pode se auto-excluir por aqui (evita ficar sem acesso por engano)
// 2) nao pode excluir o ultimo usuario restante do tenant (evita tenant orfao)

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

    const body = await req.json().catch(() => null);
    const targetUserId = body?.userId;
    if (!targetUserId) {
      return json({ error: "Usuário não informado." }, 400);
    }

    if (targetUserId === userData.user.id) {
      return json({ error: "Você não pode excluir seu próprio usuário por aqui." }, 400);
    }

    // daqui pra baixo, ja confirmado o tenant -- pode usar a chave admin.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // confirma que o alvo pertence ao MESMO tenant de quem chamou -- sem
    // isso, qualquer usuario autenticado poderia apagar login de outro tenant
    // so sabendo o userId.
    const { data: targetRow, error: targetErr } = await admin
      .from("tenant_users")
      .select("tenant_id")
      .eq("user_id", targetUserId)
      .eq("tenant_id", tenantRow.tenant_id)
      .single();

    if (targetErr || !targetRow) {
      return json({ error: "Esse usuário não pertence à sua conta." }, 403);
    }

    const { count, error: countErr } = await admin
      .from("tenant_users")
      .select("user_id", { count: "exact", head: true })
      .eq("tenant_id", tenantRow.tenant_id);

    if (countErr) return json({ error: countErr.message }, 400);
    if ((count || 0) <= 1) {
      return json({ error: "Não é possível excluir o único usuário da conta." }, 400);
    }

    const { error: unlinkErr } = await admin
      .from("tenant_users")
      .delete()
      .eq("tenant_id", tenantRow.tenant_id)
      .eq("user_id", targetUserId);
    if (unlinkErr) {
      return json({ error: unlinkErr.message }, 400);
    }

    const { error: deleteErr } = await admin.auth.admin.deleteUser(targetUserId);
    if (deleteErr) {
      return json({ error: deleteErr.message }, 400);
    }

    return json({ ok: true });
  } catch (err) {
    return json({ error: (err as Error).message || "Erro inesperado." }, 500);
  }
});
