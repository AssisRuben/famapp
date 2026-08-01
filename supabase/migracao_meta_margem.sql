-- ============================================================
-- Migração pra rodar no projeto Supabase REAL — muda o sistema de
-- metas pra comparar contra MARGEM BRUTA em vez de faturamento
-- líquido (01/08/2026: confirmado que a meta cadastrada pela farmácia
-- é de margem, não de venda).
--
-- Reaplica o mesmo fator de correção de custo (-8%) já usado em
-- vw_metricas_vendedor_diario/mensal — ver migracao_correcao_custo.sql.
-- ============================================================

create or replace view vw_metas_progresso as
select
  m.id as meta_id,
  m.codigo_vendedor,
  vd.nome as nome_vendedor,
  m.ano,
  m.mes,
  m.semana,
  m.valor_meta,
  coalesce(realizado.valor, 0) as valor_realizado
from metas m
join vendedores vd on vd.codigo = m.codigo_vendedor
left join lateral (
  select
    sum(vi.valor_total_liquido) - sum(coalesce(vi.vlr_custo_produto, vi.valor_total_custo, vi.vlr_custo_aquisicao)) * 0.92 as valor
  from vendas v
  join venda_itens vi on vi.venda_id = v.id
  where v.codigo_vendedor = m.codigo_vendedor
    and v.tipo_cancelamento is null
    and extract(year from v.data_emissao) = m.ano
    and extract(month from v.data_emissao) = m.mes
    and (
      m.semana is null
      or (m.semana = 1 and extract(day from v.data_emissao) between 1 and 7)
      or (m.semana = 2 and extract(day from v.data_emissao) between 8 and 14)
      or (m.semana = 3 and extract(day from v.data_emissao) between 15 and 21)
      or (m.semana = 4 and extract(day from v.data_emissao) >= 22)
    )
) realizado on true;

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
  mp.valor_realizado as margem_bruta_valor,
  faixa.percentual_comissao,
  round(mp.valor_realizado * faixa.percentual_comissao / 100, 2) as comissao_valor
from vw_metas_progresso mp
join lateral (
  select percentual_comissao
  from faixas_comissao
  where percentual_meta_min <= coalesce(round(mp.valor_realizado / nullif(mp.valor_meta, 0) * 100, 2), 0)
  order by percentual_meta_min desc
  limit 1
) faixa on true
where mp.semana is null;

alter view vw_metas_progresso set (security_invoker = true);
alter view vw_metas_comissao set (security_invoker = true);
