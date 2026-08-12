-- [12/08/2026, revertido no mesmo dia] O mecanismo que popularia
-- tipo_cancelamento (endpoint /venda/cancelamento/obter-alterados-v1,
-- fluxo "Cancelamento de venda" no coletor) foi removido depois de
-- confirmar que tipoCancelamento='E' marca qualquer estorno de
-- pagamento (ex.: Farmácia Popular), não só venda genuinamente
-- cancelada — em produção, 7 de 7 notas marcadas eram vendas normais
-- e finalizadas. Ver coletor/README.md pro histórico completo.
-- O filtro abaixo continua inofensivo (tipo_cancelamento nunca mais é
-- populado, então a condição é sempre verdadeira), só não faz mais
-- nada de útil — venda genuinamente cancelada já nem sincroniza via
-- /venda/obter-alterados-v1, então o Painel já ficava correto sem isso.
--
-- [12/08/2026] Vendas estornadas/canceladas contando como venda normal
-- no card Desempenho do Painel (Dia/Semana/Mês/Período) e no Ranking.
--
-- Achado investigando divergência entre o Painel e o relatório "Totais
-- por Vendedor" da Trier: `tipo_cancelamento` sempre vinha NULL em
-- `vendas`, mesmo pra vendas confirmadamente estornadas — não porque a
-- API não manda esse dado, mas porque ele só vem por um endpoint
-- separado (`/venda/cancelamento/obter-alterados-v1`), que o coletor
-- nunca chamou (só usava `/venda/obter-alterados-v1`, que nunca traz
-- `tipoCancelamento`/`numeroNotaOrigem` preenchidos). Comparação direta
-- 12/08/2026 (01/08-12/08, filial 1): banco tinha 1.799 vendas/R$109.085,82
-- contra 1.778/R$108.147,38 da Trier (que já desconta devolução) — os
-- 21 estornos do período explicam quase toda a diferença de ~R$938.
--
-- Ver coletor/backfill_cancelamentos.js (marca os estornos já
-- sincronizados) e o novo fluxo "Cancelamento" em
-- coletor/sgf-incremental.n8n.json (mantém isso em dia daqui pra
-- frente). Esta migração só ajusta as views/função — sem o backfill,
-- `tipo_cancelamento` continua nulo pros estornos já gravados e o
-- filtro abaixo não muda nada até rodar o backfill.
--
-- Decisão do usuário (12/08/2026): vendas estornadas NÃO devem contar
-- na performance de vendedor/vendas do Painel — isso substitui a
-- decisão anterior (migracao_metricas_periodo_customizado.sql) de
-- propositalmente não filtrar `tipo_cancelamento` pra manter os tiles
-- consistentes entre si; agora todos ficam consistentes filtrando.
--
-- NÃO mexe em vw_desempenho_vendedor_* / fn_desempenho_vendedor_periodo
-- (itens/atendimento) nem em vw_ranking_vendedores_dia diretamente:
-- os primeiros vêm de `vendas_vendedor_diario`, que é um agregado que a
-- própria Trier já devolve pronto (endpoint
-- obter-atendimentos-diario-vendedor-v1) sem link pra `vendas.id` —
-- não tem `tipo_cancelamento` pra filtrar aqui; o ranking herda o
-- filtro automaticamente por já selecionar de vw_metricas_vendedor_diario.
-- NÃO mexe em Metas/Comissão (vw_metas_progresso, vw_metas_comissao,
-- fechar_comissoes_mes) — fora do escopo pedido (só Desempenho/Painel),
-- decisão separada se quiser aplicar o mesmo critério lá.

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
  sum(coalesce(vi.vlr_custo_produto, vi.valor_total_custo, vi.vlr_custo_aquisicao)) * 0.92 as total_custo,
  round(
    (sum(vi.valor_total_liquido) - sum(coalesce(vi.vlr_custo_produto, vi.valor_total_custo, vi.vlr_custo_aquisicao)) * 0.92)
    / nullif(sum(vi.valor_total_liquido),0) * 100,
  2) as margem_bruta_pct,
  vend.nome as nome_vendedor
from venda_itens vi
join vendas vd on vd.id = vi.venda_id
join vendedores vend on vend.codigo = vi.codigo_vendedor
where vd.tipo_cancelamento is null
group by vd.data_emissao, vi.codigo_vendedor, vend.nome;

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
where vd.tipo_cancelamento is null
group by extract(year from vd.data_emissao), extract(month from vd.data_emissao), vi.codigo_vendedor, vend.nome;

create or replace view vw_metricas_vendedor_semanal as
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
where vd.tipo_cancelamento is null
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

create or replace function fn_metricas_vendedor_periodo(data_inicio date, data_fim date)
returns table (
  codigo_vendedor integer,
  nome_vendedor text,
  qtd_notas bigint,
  faturamento_liquido numeric,
  faturamento_bruto numeric,
  total_desconto numeric,
  taxa_desconto_pct numeric,
  ticket_medio numeric,
  total_custo numeric,
  margem_bruta_pct numeric
)
language sql stable as $$
  select
    vi.codigo_vendedor,
    vend.nome as nome_vendedor,
    count(distinct vd.id) as qtd_notas,
    sum(vi.valor_total_liquido) as faturamento_liquido,
    sum(vi.valor_total_bruto) as faturamento_bruto,
    sum(vi.valor_total_bruto) - sum(vi.valor_total_liquido) as total_desconto,
    round((sum(vi.valor_total_bruto) - sum(vi.valor_total_liquido)) / nullif(sum(vi.valor_total_bruto), 0) * 100, 2) as taxa_desconto_pct,
    round(sum(vi.valor_total_liquido) / nullif(count(distinct vd.id), 0), 2) as ticket_medio,
    sum(coalesce(vi.vlr_custo_produto, vi.valor_total_custo, vi.vlr_custo_aquisicao)) * 0.92 as total_custo,
    round(
      (sum(vi.valor_total_liquido) - sum(coalesce(vi.vlr_custo_produto, vi.valor_total_custo, vi.vlr_custo_aquisicao)) * 0.92)
      / nullif(sum(vi.valor_total_liquido), 0) * 100,
    2) as margem_bruta_pct
  from venda_itens vi
  join vendas vd on vd.id = vi.venda_id
  join vendedores vend on vend.codigo = vi.codigo_vendedor
  where vd.data_emissao between data_inicio and data_fim
    and vd.tipo_cancelamento is null
  group by vi.codigo_vendedor, vend.nome;
$$;
