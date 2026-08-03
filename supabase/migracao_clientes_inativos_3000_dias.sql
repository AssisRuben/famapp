-- ============================================================
-- Migração pra rodar no projeto Supabase REAL — filtra clientes com
-- última compra há mais de 3000 dias (~8 anos) pra fora de
-- vw_clientes_inatividade (03/08/2026: cadastro morto sem resgate
-- razoável, só polui a lista "Cliente para resgate" e o tile
-- "Clientes inativos" do Painel).
--
-- Filtro, não DELETE — nenhum dado é apagado (cliente e vendas
-- continuam intactos no banco), só somem dessa consulta específica.
--
-- Idempotente (create or replace), seguro rodar mais de uma vez.
-- ============================================================

create or replace view vw_clientes_inatividade as
select
  c.codigo,
  c.nome,
  c.fone as telefone,
  ultima_venda.data_emissao as ultima_compra,
  (current_date - ultima_venda.data_emissao) as dias_sem_comprar,
  case when ultima_venda.data_emissao < current_date - interval '60 days' then true else false end as inativo,
  ultima_venda.codigo_vendedor,
  vd.nome as nome_vendedor
from clientes c
join lateral (
  select v.data_emissao, v.codigo_vendedor
  from vendas v
  where v.codigo_cliente = c.codigo
  order by v.data_emissao desc, v.id desc
  limit 1
) ultima_venda on true
left join vendedores vd on vd.codigo = ultima_venda.codigo_vendedor
where exists (
  select 1 from profiles p where p.id = auth.uid()
)
and (current_date - ultima_venda.data_emissao) <= 3000;

alter view vw_clientes_inatividade set (security_invoker = false);

-- ---------- VERIFICAÇÃO (opcional, só leitura) ----------
-- Confere quantos ficaram de fora do filtro (não devem mais aparecer
-- em vw_clientes_inatividade):
-- select count(*) from clientes c
-- join lateral (
--   select v.data_emissao from vendas v
--   where v.codigo_cliente = c.codigo
--   order by v.data_emissao desc, v.id desc limit 1
-- ) uv on true
-- where (current_date - uv.data_emissao) > 3000;
