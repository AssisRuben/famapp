-- ============================================================
-- Migração pra rodar no projeto Supabase REAL — aplica uma correção
-- empírica temporária de -8% no custo usado pra calcular margem
-- bruta (Painel + comissão).
--
-- Motivo: pra venda recente, vlr_custo_produto e vlr_custo_aquisicao
-- vêm 100% nulos da API SGF (só valor_total_custo é preenchido) — e
-- esse campo sozinho soma ~8% acima da coluna "Valor Custo" do
-- relatório real "Vendas por Vendedor" da Trier (achado 31/07/2026,
-- comparando julho/26: nosso R$188.731,40 vs R$174.851,92 real —
-- 174851.92/188731.40 ≈ 0.9264, arredondado pra 0.92 de fator).
--
-- CAUSA RAIZ CONFIRMADA (01/08/2026): a tela de relatório da Trier
-- tem 4 critérios de custo configuráveis (Custo do Cadastro de
-- Produtos, Custo de Aquisição, Valor Última Entrada, Valor Última
-- Entrada Com ST). valor_total_custo da API bate com o critério
-- PADRÃO (Custo do Cadastro), não com "Custo de Aquisição" (o que a
-- farmácia usa) — confirmado comparando dois relatórios do mesmo dia
-- com critérios diferentes: R$1.842,34 (padrão, bate exato com nosso
-- sum(valor_total_custo)) vs R$1.722,00 (Custo de Aquisição). O campo
-- que teria o valor certo (vlr_custo_aquisicao) é justamente o que
-- vem NULL pra venda recente. A proporção entre os dois critérios
-- varia por período (~6,5% em 01/08 vs ~7,4% em julho/26 inteiro) —
-- 0.92 é uma aproximação, não uma relação fixa. Ver coletor/README.md,
-- pendência "Perguntas em aberto pro suporte/sistema da Trier", item 2
-- (perguntar se dá pra pedir "Custo de Aquisição" direto via API).
--
-- Remover esse fator (ou recalibrar) se a Trier confirmar um jeito de
-- pegar Custo de Aquisição direto pra venda recente. Idempotente
-- (create or replace).
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
  sum(coalesce(vi.vlr_custo_produto, vi.valor_total_custo, vi.vlr_custo_aquisicao)) * 0.92 as total_custo,
  round(
    (sum(vi.valor_total_liquido) - sum(coalesce(vi.vlr_custo_produto, vi.valor_total_custo, vi.vlr_custo_aquisicao)) * 0.92)
    / nullif(sum(vi.valor_total_liquido),0) * 100,
  2) as margem_bruta_pct,
  vend.nome as nome_vendedor
from venda_itens vi
join vendas vd on vd.id = vi.venda_id
join vendedores vend on vend.codigo = vi.codigo_vendedor
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
group by extract(year from vd.data_emissao), extract(month from vd.data_emissao), vi.codigo_vendedor, vend.nome;

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
  select sum(vi.valor_total_liquido) - sum(coalesce(vi.vlr_custo_produto, vi.valor_total_custo, vi.vlr_custo_aquisicao)) * 0.92 as margem_bruta_valor
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

-- Reaplica security_invoker/no-invoker explicitamente (CREATE OR
-- REPLACE VIEW nem sempre preserva reloptions já setados via ALTER
-- VIEW).
alter view vw_metricas_vendedor_diario set (security_invoker = true);
alter view vw_metricas_vendedor_mensal set (security_invoker = true);
alter view vw_metas_comissao set (security_invoker = true);
