-- ============================================================
-- Migração pra rodar no projeto Supabase REAL (03/08/2026) — cria
-- vw_produtos_em_falta, que resolve o nome de quem registrou cada
-- falta, mas SÓ devolve pra quem está logado como gestor (vendedor
-- recebe null nessa coluna, mesmo lendo a mesma view).
--
-- SEM security_invoker de propósito: profiles só deixa cada um ler o
-- PRÓPRIO perfil (RLS restritiva), então a view precisa rodar com
-- privilégio de dono e decidir por dentro (checando auth.uid()) o que
-- devolver — mesmo padrão de vw_receita_identificacao_comprador.
--
-- Idempotente — pode rodar de novo sem erro.
-- ============================================================

create or replace view vw_produtos_em_falta as
select
  pef.id,
  pef.nome_produto,
  pef.codigo_produto,
  pef.data,
  case
    when exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor')
    then coalesce(vd.nome, 'Gestor(a) da Farmácia')
    else null
  end as nome_registrado_por
from produtos_em_falta pef
left join profiles perfil_registro on perfil_registro.id = pef.registrado_por
left join vendedores vd on vd.codigo = perfil_registro.codigo_vendedor;

-- ---------- VERIFICAÇÃO (opcional, só leitura) ----------
-- select * from vw_produtos_em_falta order by data desc limit 20;
