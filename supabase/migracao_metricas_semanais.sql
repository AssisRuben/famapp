-- ============================================================
-- Migração pra rodar no projeto Supabase REAL — adiciona as views
-- semanais usadas pelo toggle Dia/Semana/Mês do card "Desempenho" do
-- Painel (unificou os cards separados de hoje/mês num só, com
-- seletor — mesmo padrão do seletor já usado em Metas).
--
-- Buckets fixos, iguais aos já usados em Metas (ver semanaDoDia() em
-- app/src/lib/metas.ts): semana 1 = dias 1-7, semana 2 = 8-14,
-- semana 3 = 15-21, semana 4 = 22-fim do mês. NÃO é janela móvel de
-- 7 dias.
--
-- Já inclui o fator de correção de custo (* 0.92) de
-- migracao_correcao_custo.sql — rodar essa migração DEPOIS daquela
-- (ou nessa ordem não importa, mas os dois precisam estar aplicados).
-- ============================================================

create view vw_metricas_vendedor_semanal as
select
  extract(year from vd.data_emissao)::int as ano,
  extract(month from vd.data_emissao)::int as mes,
  (case
    when extract(day from vd.data_emissao) <= 7 then 1
    when extract(day from vd.data_emissao) <= 14 then 2
    when extract(day from vd.data_emissao) <= 21 then 3
    else 4
  end) as semana,
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
group by
  extract(year from vd.data_emissao),
  extract(month from vd.data_emissao),
  (case
    when extract(day from vd.data_emissao) <= 7 then 1
    when extract(day from vd.data_emissao) <= 14 then 2
    when extract(day from vd.data_emissao) <= 21 then 3
    else 4
  end),
  vi.codigo_vendedor, vend.nome;

create view vw_desempenho_vendedor_semanal as
select
  extract(year from vvd.data_emissao)::int as ano,
  extract(month from vvd.data_emissao)::int as mes,
  (case
    when extract(day from vvd.data_emissao) <= 7 then 1
    when extract(day from vvd.data_emissao) <= 14 then 2
    when extract(day from vvd.data_emissao) <= 21 then 3
    else 4
  end) as semana,
  vvd.codigo_vendedor,
  v.nome as nome_vendedor,
  sum(vvd.quantidade_atendimentos) as quantidade_atendimentos,
  sum(vvd.quantidade_itens) as quantidade_itens,
  round(sum(vvd.quantidade_itens)::numeric / nullif(sum(vvd.quantidade_atendimentos),0), 2) as itens_por_atendimento
from vendas_vendedor_diario vvd
join vendedores v on v.codigo = vvd.codigo_vendedor
group by
  extract(year from vvd.data_emissao),
  extract(month from vvd.data_emissao),
  (case
    when extract(day from vvd.data_emissao) <= 7 then 1
    when extract(day from vvd.data_emissao) <= 14 then 2
    when extract(day from vvd.data_emissao) <= 21 then 3
    else 4
  end),
  vvd.codigo_vendedor, v.nome;

alter view vw_metricas_vendedor_semanal set (security_invoker = true);
alter view vw_desempenho_vendedor_semanal set (security_invoker = true);
