-- Migração pra rodar no projeto Supabase REAL (26/08/2026) — corrige
-- vw_metas_progresso (Metas/Ranking/Comissão) pra usar a mesma fonte
-- de custo já corrigida em vw_metricas_vendedor_diario/mensal/semanal
-- desde 12/08 (migracao_custo_aquisicao_desempenho.sql).
--
-- Achado: comparando o valor de "realizado" da meta no app com o
-- cálculo direto, batia exato com a fórmula ANTIGA (`coalesce(
-- vlr_custo_produto, valor_total_custo, vlr_custo_aquisicao) * 0.92`)
-- — essa view nunca recebeu a correção de 12/08. produto_catalogo.
-- custo_medio bate exato com "Custo Aquisição" da tela da Trier
-- (confirmado então); o fator -8% era só aproximação em cima do campo
-- errado. Impacto real: como comissão é calculada em cima dessa
-- margem (vw_metas_comissao -> fechar_comissoes_mes), a comissão paga
-- vinha sendo calculada sobre um número mais baixo do que deveria.
--
-- Mesma view, só troca a fonte de custo dentro do lateral join.
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
    sum(vi.valor_total_liquido) - sum(vi.quantidade_produtos * coalesce(pc.custo_medio, 0)) as valor
  from vendas v
  join venda_itens vi on vi.venda_id = v.id
  left join produto_catalogo pc on pc.codigo = vi.codigo_produto
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

-- vw_metas_comissao, vw_faixa_comissao_atual e fechar_comissoes_mes
-- não precisam de nenhuma mudança — todos leem de vw_metas_progresso,
-- herdam a correção automaticamente.

-- ---------- VERIFICAÇÃO (opcional) ----------
-- select * from vw_metas_progresso where mes = extract(month from current_date) and semana is null order by valor_realizado desc;
