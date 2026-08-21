-- ============================================================
-- Migracao 002: dados de contato do cliente + Agenda de ativacoes
-- Rode isso no SQL Editor DEPOIS de ja ter rodado schema.sql e
-- seed-example.sql uma vez. Seguro rodar de novo (usa "if not exists").
-- ============================================================

-- ---------- Novos campos de contato em brand_clients ----------

alter table brand_clients add column if not exists contact_name text;
alter table brand_clients add column if not exists contact_phone text;
alter table brand_clients add column if not exists notes text;

-- ---------- Agenda de ativacoes ----------

create table if not exists activations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  brand_client_id uuid references brand_clients(id) on delete set null,
  client_title text not null,
  scheduled_date date not null,
  location text,
  notes text,
  status text not null default 'agendada' check (status in ('agendada', 'concluida', 'cancelada')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_activations_updated_at on activations;
create trigger trg_activations_updated_at
  before update on activations
  for each row execute function set_updated_at();

alter table activations enable row level security;

create policy "activations: acesso do proprio tenant" on activations
  for all using (
    tenant_id in (select tenant_id from tenant_users where user_id = auth.uid())
  ) with check (
    tenant_id in (select tenant_id from tenant_users where user_id = auth.uid())
  );
