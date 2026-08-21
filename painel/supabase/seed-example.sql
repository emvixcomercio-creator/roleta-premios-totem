-- Rode isso DEPOIS de:
--   1) rodar schema.sql inteiro
--   2) criar o primeiro usuario em Authentication > Users > Add user
--      (email + senha da Radio Transcontinental)
--   3) copiar o UUID desse usuario (aparece na coluna "UID" da lista)
--
-- Troque 'COLE_O_UUID_DO_USUARIO_AQUI' pelo UUID de verdade antes de rodar.
-- So precisa rodar isso UMA VEZ (cria o tenant "Radio Transcontinental" e
-- liga o login criado a ele).

with novo_tenant as (
  insert into tenants (name, slug, logo_url)
  values ('Rádio Transcontinental', 'radio-transcontinental', null)
  returning id
)
insert into tenant_users (tenant_id, user_id, role)
select id, 'COLE_O_UUID_DO_USUARIO_AQUI'::uuid, 'admin'
from novo_tenant;
