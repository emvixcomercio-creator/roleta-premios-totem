import { supabase } from './supabaseClient.js';

// Chama no topo de dashboard.html/cliente.html: manda pro login se não
// houver sessão, e desloga automaticamente se a sessão expirar.
export async function requireSession(){
  const { data: { session } } = await supabase.auth.getSession();
  if(!session){
    window.location.href = 'index.html';
    return null;
  }
  supabase.auth.onAuthStateChange((_event, newSession) => {
    if(!newSession) window.location.href = 'index.html';
  });
  return session;
}

// Cada login pertence a exatamente um tenant (uma rádio) hoje.
export async function getMyTenant(){
  const { data, error } = await supabase
    .from('tenant_users')
    .select('tenant_id, tenants(name, logo_url)')
    .limit(1)
    .single();
  if(error || !data){
    throw new Error('Este usuário não está vinculado a nenhuma conta. Fale com o suporte.');
  }
  return { tenantId: data.tenant_id, tenantName: data.tenants?.name, tenantLogoUrl: data.tenants?.logo_url };
}

// O redirecionamento em si já é feito pelo listener onAuthStateChange
// (registrado em requireSession) quando a sessão vira null -- não repetir
// aqui pra não disparar duas navegações concorrentes pro mesmo lugar.
export async function logout(){
  await supabase.auth.signOut();
}
