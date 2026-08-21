-- ============================================================
-- Migracao 003: status de relacionamento do cliente (funil)
-- Rode isso no SQL Editor DEPOIS de ja ter rodado schema.sql,
-- seed-example.sql e migration_002. Seguro rodar de novo.
-- ============================================================

alter table brand_clients add column if not exists relationship_status text
  not null default 'primeiro_contato'
  check (relationship_status in (
    'primeiro_contato',
    'proposta_enviada',
    'contrato_fechado',
    'ativacao_agendada',
    'ativacao_realizada'
  ));
