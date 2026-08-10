-- ============================================================
-- vw_metricas_vendedor_mensal ficou sem o fator de correção de custo
-- (× 0.92, ver migracao_correcao_custo.sql) — vw_metricas_vendedor_diario
-- e vw_metricas_vendedor_semanal já têm o fator certo, só a mensal
-- ficou pra trás (achado 10/08/2026 comparando "Desempenho" (Mês) do
-- Painel contra o relatório real "Vendas por Vendedor" da Trier: margem
-- do app ficava ~10% abaixo do real porque o custo usado não tinha o
-- desconto de 8%). Reaplica exatamente a mesma fórmula de diário/semanal.
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
  sum(coalesce(vi.vlr_custo_produto, vi.valor_total_custo, vi.vlr_custo_aquisicao)) * 0.92 as total_custo,
  round(
    (sum(vi.valor_total_liquido) - sum(coalesce(vi.vlr_custo_produto, vi.valor_total_custo, vi.vlr_custo_aquisicao)) * 0.92)
    / nullif(sum(vi.valor_total_liquido),0) * 100,
  2) as margem_bruta_pct,
  vend.nome as nome_vendedor
from venda_itens vi
join vendas vd on vd.id = vi.venda_id
join vendedores vend on vend.codigo = vi.codigo_vendedor
group by extract(year from vd.data_emissao), extract(month from vd.data_emissao), vi.codigo_vendedor, vend.nome;

alter view vw_metricas_vendedor_mensal set (security_invoker = true);
