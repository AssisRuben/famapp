-- [12/08/2026] Margem bruta do Painel usava venda_itens.valor_total_custo
-- (único campo de custo não-nulo em venda_itens; vlr_custo_produto e
-- vlr_custo_aquisicao sempre vêm NULL da API) com uma correção
-- empírica de -8% (`* 0.92`), porque valor_total_custo bate com o
-- critério "Custo do Cadastro de Produtos" da Trier, não "Custo de
-- Aquisição" (o que a farmácia usa pra precificar — confirmado
-- 01/08/2026, ver migracao_correcao_custo.sql).
--
-- Achado 12/08/2026, conferindo direto na tela da Trier (Cadastros >
-- Produtos > aba "Inf. Adicionais") pro produto Glifage XR (código
-- 3434): o campo lá chamado literalmente "Custo Aquisição" = R$6,95,
-- e bate EXATO com produto_catalogo.custo_medio (mapeado de
-- valorCustoMedio da API, já sincronizado por backfill_periodo.js).
-- Ou seja: dá pra pegar o custo de aquisição certo direto do catálogo
-- de produtos, sem precisar de correção chutada.
--
-- Troca: total_custo/margem_bruta_pct passam a vir de
-- produto_catalogo.custo_medio × quantidade (via join por
-- codigo_produto) em vez de venda_itens.valor_total_custo × 0.92.
-- Remove o fator -8%.
--
-- Ressalva aceita: custo_medio é o custo de aquisição ATUAL (última
-- entrada registrada), não o custo em vigor na data da venda antiga —
-- pra vendas do mês corrente isso é preciso; pra meses passados, se o
-- custo do produto mudou desde então, é uma aproximação (mesma
-- natureza de aproximação que já existia com o fator -8%, só que
-- agora baseada no campo certo em vez de um chute).
--
-- LEFT JOIN (não INNER) — produto sem custo_medio sincronizado
-- (catálogo tem 26mil+ produtos, o backfill pode não ter cobertura
-- 100%) some da soma via coalesce(...,0) em vez de derrubar a venda
-- inteira da métrica.

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
  sum(vi.quantidade_produtos * coalesce(pc.custo_medio, 0)) as total_custo,
  round(
    (sum(vi.valor_total_liquido) - sum(vi.quantidade_produtos * coalesce(pc.custo_medio, 0)))
    / nullif(sum(vi.valor_total_liquido),0) * 100,
  2) as margem_bruta_pct,
  vend.nome as nome_vendedor
from venda_itens vi
join vendas vd on vd.id = vi.venda_id
join vendedores vend on vend.codigo = vi.codigo_vendedor
left join produto_catalogo pc on pc.codigo = vi.codigo_produto
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
  sum(vi.quantidade_produtos * coalesce(pc.custo_medio, 0)) as total_custo,
  round(
    (sum(vi.valor_total_liquido) - sum(vi.quantidade_produtos * coalesce(pc.custo_medio, 0)))
    / nullif(sum(vi.valor_total_liquido),0) * 100,
  2) as margem_bruta_pct,
  vend.nome as nome_vendedor
from venda_itens vi
join vendas vd on vd.id = vi.venda_id
join vendedores vend on vend.codigo = vi.codigo_vendedor
left join produto_catalogo pc on pc.codigo = vi.codigo_produto
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
  sum(vi.quantidade_produtos * coalesce(pc.custo_medio, 0)) as total_custo,
  round(
    (sum(vi.valor_total_liquido) - sum(vi.quantidade_produtos * coalesce(pc.custo_medio, 0)))
    / nullif(sum(vi.valor_total_liquido),0) * 100,
  2) as margem_bruta_pct,
  vend.nome as nome_vendedor
from venda_itens vi
join vendas vd on vd.id = vi.venda_id
join vendedores vend on vend.codigo = vi.codigo_vendedor
left join produto_catalogo pc on pc.codigo = vi.codigo_produto
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
    sum(vi.quantidade_produtos * coalesce(pc.custo_medio, 0)) as total_custo,
    round(
      (sum(vi.valor_total_liquido) - sum(vi.quantidade_produtos * coalesce(pc.custo_medio, 0)))
      / nullif(sum(vi.valor_total_liquido), 0) * 100,
    2) as margem_bruta_pct
  from venda_itens vi
  join vendas vd on vd.id = vi.venda_id
  join vendedores vend on vend.codigo = vi.codigo_vendedor
  left join produto_catalogo pc on pc.codigo = vi.codigo_produto
  where vd.data_emissao between data_inicio and data_fim
    and vd.tipo_cancelamento is null
  group by vi.codigo_vendedor, vend.nome;
$$;
