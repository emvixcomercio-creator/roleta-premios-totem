-- ============================================================
-- Painel de gestao "Gira e Ganha" -- schema Supabase
-- Rode este arquivo inteiro no SQL Editor do seu projeto Supabase
-- (Project > SQL Editor > New query), uma unica vez.
-- ============================================================

-- ---------- Tabelas ----------

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  logo_url text,
  created_at timestamptz not null default now()
);

create table if not exists tenant_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'admin',
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create table if not exists brand_clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  title text not null,
  logo_url text,
  bg_url text,
  palette jsonb,
  hub_zoom numeric not null default 1,
  prizes jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- indice das copias de seguranca (o arquivo em si mora no bucket "backups").
-- brand_client_id usa "on delete set null" (nao cascade) de proposito: se o
-- cliente ativo for apagado, o backup continua existindo -- é a rede de
-- seguranca, nao deveria morrer junto com a linha que ela protege.
create table if not exists brand_backups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  brand_client_id uuid references brand_clients(id) on delete set null,
  client_title text,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_brand_clients_updated_at on brand_clients;
create trigger trg_brand_clients_updated_at
  before update on brand_clients
  for each row execute function set_updated_at();

-- ---------- Row Level Security ----------
-- Isto e o unico portao de seguranca do sistema (a anon key e publica por
-- design). Toda tabela filtra por "meu tenant_id", resolvido via
-- tenant_users. Sem essas policies corretas, qualquer usuario logado
-- enxergaria os dados de todo mundo.

alter table tenants enable row level security;
alter table tenant_users enable row level security;
alter table brand_clients enable row level security;
alter table brand_backups enable row level security;

-- tenants/tenant_users: leitura do proprio registro, sem escrita pelo
-- cliente (tenants e tenant_users so sao criados manualmente, ver
-- seed-example.sql).
create policy "tenants: ver o proprio" on tenants
  for select using (
    id in (select tenant_id from tenant_users where user_id = auth.uid())
  );

create policy "tenant_users: ver o proprio vinculo" on tenant_users
  for select using (user_id = auth.uid());

-- brand_clients / brand_backups: acesso total (select/insert/update/delete),
-- mas sempre restrito ao proprio tenant.
create policy "brand_clients: acesso do proprio tenant" on brand_clients
  for all using (
    tenant_id in (select tenant_id from tenant_users where user_id = auth.uid())
  ) with check (
    tenant_id in (select tenant_id from tenant_users where user_id = auth.uid())
  );

create policy "brand_backups: acesso do proprio tenant" on brand_backups
  for all using (
    tenant_id in (select tenant_id from tenant_users where user_id = auth.uid())
  ) with check (
    tenant_id in (select tenant_id from tenant_users where user_id = auth.uid())
  );

-- ---------- Storage ----------
-- Antes de rodar as policies abaixo, crie os 2 buckets manualmente em
-- Storage > New bucket:
--   "brand-assets" -> marcar "Public bucket" (leitura publica; sao so
--                     logos/fundos, nada sensivel)
--   "backups"      -> deixar privado (NAO marcar "Public bucket")
--
-- As policies assumem que o primeiro pedaco do caminho do arquivo e sempre
-- o tenant_id, ex: "{tenant_id}/{brand_id}/logo-169....png".

create policy "brand-assets: leitura publica"
  on storage.objects for select
  using (bucket_id = 'brand-assets');

create policy "brand-assets: escrita do proprio tenant"
  on storage.objects for insert
  with check (
    bucket_id = 'brand-assets'
    and (storage.foldername(name))[1]::uuid in (
      select tenant_id from tenant_users where user_id = auth.uid()
    )
  );

create policy "brand-assets: atualizacao do proprio tenant"
  on storage.objects for update
  using (
    bucket_id = 'brand-assets'
    and (storage.foldername(name))[1]::uuid in (
      select tenant_id from tenant_users where user_id = auth.uid()
    )
  );

create policy "backups: acesso do proprio tenant"
  on storage.objects for all
  using (
    bucket_id = 'backups'
    and (storage.foldername(name))[1]::uuid in (
      select tenant_id from tenant_users where user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'backups'
    and (storage.foldername(name))[1]::uuid in (
      select tenant_id from tenant_users where user_id = auth.uid()
    )
  );
