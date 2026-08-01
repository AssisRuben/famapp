-- ============================================================
-- Migração pra rodar no projeto Supabase REAL — corrige taxa de
-- desconto e margem bruta, que estavam zeradas no Painel.
--
-- Causa: vlr_desconto e vlr_custo_produto vêm NULL da API pra venda
-- recente (confirmado comparando com relatório real da Trier em
-- 31/07/2026 — 132 de 132 vendas do dia sem esses campos; não é bug
-- de parsing do coletor, os nomes de campo já foram conferidos contra
-- docs/api-sgf-openapi.json). Ainda não confirmado se é limitação da
-- API pra esse token ou se o dado só existe cadastrado depois (ver
-- coletor/README.md).
--
-- Fix:
-- - Taxa de desconto: (faturamento_bruto - faturamento_liquido) já É
--   o desconto total, sem depender de vlr_desconto.
-- - Margem bruta: sem um "bruto menos líquido" equivalente pra custo,
--   usa coalesce entre os 3 campos de custo que a tabela tem
--   (vlr_custo_produto, valor_total_custo, vlr_custo_aquisicao) — se
--   nenhum vier preenchido, continua NULL (não inventa zero).
--
-- Idempotente (create or replace), seguro rodar mais de uma vez.
-- ============================================================

create or replace view vw_metricas_vendedor_diario as
select
  vd.data_emissao,
  vi.codigo_vendedor,
  count(distinct vd.id) as qtd_notas,
  sum(vi.valor_total_liquido) as faturamento_liquido,
  sum(vi.valor_total_bruto) as faturamento_bruto,
  sum(vi.valor_total_bruto) - sum(vi.valor_total_liquido) as total_desconto,
  round((sum(vi.valor_total_bruto) - sum(vi.valor_total_liquido)) / nullif(sum(vi.valor_total_bruto),0) * 100, 2) as taxa_desconto_pct,
  sum(vi.valor_total_liquido * (vi.prc_comissao/100.0)) as comissao_estimada,
  round(sum(vi.valor_total_liquido) / nullif(count(distinct vd.id),0), 2) as ticket_medio,
  sum(coalesce(vi.vlr_custo_produto, vi.valor_total_custo, vi.vlr_custo_aquisicao)) as total_custo,
  round(
    (sum(vi.valor_total_liquido) - sum(coalesce(vi.vlr_custo_produto, vi.valor_total_custo, vi.vlr_custo_aquisicao)))
    / nullif(sum(vi.valor_total_liquido),0) * 100,
  2) as margem_bruta_pct,
  vend.nome as nome_vendedor
from venda_itens vi
join vendas vd on vd.id = vi.venda_id
join vendedores vend on vend.codigo = vi.codigo_vendedor
group by vd.data_emissao, vi.codigo_vendedor, vend.nome;

create or replace view vw_ranking_vendedores_dia as
select
  data_emissao,
  codigo_vendedor,
  faturamento_liquido,
  rank() over (partition by data_emissao order by faturamento_liquido desc) as posicao,
  nome_vendedor
from vw_metricas_vendedor_diario;

create or replace view vw_metas_comissao as
select
  mp.meta_id,
  mp.codigo_vendedor,
  mp.nome_vendedor,
  mp.ano,
  mp.mes,
  mp.valor_meta,
  mp.valor_realizado,
  round(mp.valor_realizado / nullif(mp.valor_meta, 0) * 100, 2) as percentual_atingido,
  coalesce(margem.margem_bruta_valor, 0) as margem_bruta_valor,
  faixa.percentual_comissao,
  round(coalesce(margem.margem_bruta_valor, 0) * faixa.percentual_comissao / 100, 2) as comissao_valor
from vw_metas_progresso mp
left join lateral (
  select sum(vi.valor_total_liquido) - sum(coalesce(vi.vlr_custo_produto, vi.valor_total_custo, vi.vlr_custo_aquisicao)) as margem_bruta_valor
  from vendas v
  join venda_itens vi on vi.venda_id = v.id
  where v.codigo_vendedor = mp.codigo_vendedor
    and v.tipo_cancelamento is null
    and extract(year from v.data_emissao) = mp.ano
    and extract(month from v.data_emissao) = mp.mes
) margem on true
join lateral (
  select percentual_comissao
  from faixas_comissao
  where percentual_meta_min <= coalesce(round(mp.valor_realizado / nullif(mp.valor_meta, 0) * 100, 2), 0)
  order by percentual_meta_min desc
  limit 1
) faixa on true
where mp.semana is null;

-- Reaplica security_invoker/no-invoker explicitamente (mesmo motivo de
-- sempre: sem Postgres à mão pra confirmar se CREATE OR REPLACE VIEW
-- preserva reloptions já setados via ALTER VIEW).
alter view vw_metricas_vendedor_diario set (security_invoker = true);
alter view vw_ranking_vendedores_dia set (security_invoker = false);
alter view vw_metas_comissao set (security_invoker = true);
