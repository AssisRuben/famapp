-- ============================================================
-- Migração pra rodar no projeto Supabase REAL — adiciona as views
-- mensais usadas pelo card "Desempenho do mês" do Painel. Rodar
-- depois de migracao_metricas_reais.sql (esse arquivo já assume o
-- fallback de custo/desconto em vigor).
-- ============================================================

create or replace view vw_metricas_vendedor_mensal as
select
  extract(year from vd.data_emissao)::int as ano,
  extract(month from vd.data_emissao)::int as mes,
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
group by extract(year from vd.data_emissao), extract(month from vd.data_emissao), vi.codigo_vendedor, vend.nome;

create or replace view vw_desempenho_vendedor_mensal as
select
  extract(year from vvd.data_emissao)::int as ano,
  extract(month from vvd.data_emissao)::int as mes,
  vvd.codigo_vendedor,
  v.nome as nome_vendedor,
  sum(vvd.quantidade_atendimentos) as quantidade_atendimentos,
  sum(vvd.quantidade_itens) as quantidade_itens,
  round(sum(vvd.quantidade_itens)::numeric / nullif(sum(vvd.quantidade_atendimentos),0), 2) as itens_por_atendimento
from vendas_vendedor_diario vvd
join vendedores v on v.codigo = vvd.codigo_vendedor
group by extract(year from vvd.data_emissao), extract(month from vvd.data_emissao), vvd.codigo_vendedor, v.nome;

alter view vw_metricas_vendedor_mensal set (security_invoker = true);
alter view vw_desempenho_vendedor_mensal set (security_invoker = true);
