-- [11/08/2026] Suporte ao seletor "Período" do card Desempenho no
-- Painel (calendário com dia único ou intervalo arrastando). As views
-- existentes (vw_metricas_vendedor_diario/semanal/mensal) só cobrem
-- dia exato, bucket de semana fixo (1-7/8-14/15-21/22-fim) ou mês
-- inteiro — nenhuma aceita um intervalo de datas livre. Funções (não
-- view) porque precisam de parâmetro.
--
-- Mesma fórmula de custo/margem de vw_metricas_vendedor_mensal
-- (coalesce vlr_custo_produto/valor_total_custo/vlr_custo_aquisicao,
-- ×0.92 — ver migracao_correcao_custo_mensal.sql) e mesmo critério das
-- outras views: NÃO filtra tipo_cancelamento (nenhuma delas filtra;
-- filtrar aqui faria o período "hoje" discordar do tile de Dia, que
-- não filtra).
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
  group by vi.codigo_vendedor, vend.nome;
$$;

-- Mesma conta de vw_desempenho_vendedor_diario, agregada por
-- intervalo de datas livre.
create or replace function fn_desempenho_vendedor_periodo(data_inicio date, data_fim date)
returns table (
  codigo_vendedor integer,
  nome_vendedor text,
  quantidade_atendimentos bigint,
  quantidade_itens bigint,
  itens_por_atendimento numeric
)
language sql stable as $$
  select
    vvd.codigo_vendedor,
    v.nome as nome_vendedor,
    sum(vvd.quantidade_atendimentos) as quantidade_atendimentos,
    sum(vvd.quantidade_itens) as quantidade_itens,
    round(sum(vvd.quantidade_itens)::numeric / nullif(sum(vvd.quantidade_atendimentos), 0), 2) as itens_por_atendimento
  from vendas_vendedor_diario vvd
  join vendedores v on v.codigo = vvd.codigo_vendedor
  where vvd.data_emissao between data_inicio and data_fim
  group by vvd.codigo_vendedor, v.nome;
$$;
