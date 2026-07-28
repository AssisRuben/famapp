-- ============================================================
-- SEED DE PROFILES — vincula usuários reais do Supabase Auth aos
-- vendedores/gestor, conforme supabase/rls_policies.sql.
--
-- PRÉ-REQUISITO (fazer no Dashboard do Supabase, não aqui):
--   Authentication > Users > Add user — criar 3 usuários com
--   e-mail + senha (marque "Auto Confirm User"):
--     1. gestor@farmapp.com        (gestor)
--     2. joao.mendes@farmapp.com   (vendedor, codigo 201)
--     3. camila.duarte@farmapp.com (vendedor, codigo 202)
--
--   Use os mesmos e-mails de supabase/seed_data.sql (vendedores
--   201/202) ou ajuste os e-mails abaixo para bater com o que
--   você cadastrou.
--
-- Depois de criar os 3 usuários, rode este script no SQL Editor.
-- Ele localiza os usuários pelo e-mail (não precisa copiar UUID
-- manualmente) e é idempotente (rodar de novo apenas atualiza).
-- ============================================================

insert into profiles (id, codigo_vendedor, role)
select id, null, 'gestor'
from auth.users
where email = 'gestor@farmapp.com'

union all

select id, 201, 'vendedor'
from auth.users
where email = 'joao.mendes@farmapp.com'

union all

select id, 202, 'vendedor'
from auth.users
where email = 'camila.duarte@farmapp.com'

on conflict (id) do update
  set codigo_vendedor = excluded.codigo_vendedor,
      role = excluded.role;

-- Conferir o resultado:
select p.role, p.codigo_vendedor, u.email
from profiles p
join auth.users u on u.id = p.id
order by p.role, p.codigo_vendedor;
