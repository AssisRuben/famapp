-- ============================================================
-- "Base de vendas p/ cálculo (dias)" na aba Compras aceitava qualquer
-- número, mas só mudava o DIVISOR da média diária — o numerador
-- (quantidade vendida) sempre vinha de vw_venda_recente_produto, que
-- tem janela FIXA de 30 dias. Resultado: qualquer valor diferente de
-- 30 nesse campo dava demanda/quantidade sugerida erradas (achado
-- 10/08/2026). Esta função parametriza de verdade o período — usada
-- só pela geração de sugestão de compras; Campanhas/Precificação
-- continuam em vw_venda_recente_produto (30 dias fixo), sem mudança.
-- ============================================================

create or replace function fn_venda_periodo_produto(dias integer)
returns table (codigo_produto integer, quantidade_vendida numeric)
language sql
stable
as $$
  select
    vi.codigo_produto,
    sum(vi.quantidade_produtos) as quantidade_vendida
  from venda_itens vi
  join vendas v on v.id = vi.venda_id
  where v.data_emissao >= current_date - make_interval(days => dias)
  group by vi.codigo_produto;
$$;
