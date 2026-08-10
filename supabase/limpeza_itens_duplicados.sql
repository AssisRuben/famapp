-- ============================================================
-- Limpeza de venda_itens duplicado — mesma venda_id + mesmo produto +
-- mesmos valores (bruto/líquido/quantidade/custo) em TODAS as colunas
-- relevantes, indicando linha duplicada por sync (não 2 compras
-- legítimas do mesmo produto, que teriam alguma diferença real).
-- Mantém a linha de MENOR id (primeira inserida), remove as demais.
-- Não filtra por vendedor/data de propósito — achado em Wanessa (23) e
-- Rafaela (27), mas pode existir em qualquer vendedor.
-- ============================================================

-- 1) RODAR PRIMEIRO — quantas linhas seriam removidas (conferir antes
--    de apagar).
with duplicados as (
  select
    id,
    row_number() over (
      partition by
        venda_id, codigo_produto, quantidade_produtos, valor_total_bruto, valor_total_liquido,
        coalesce(vlr_custo_produto, -1), coalesce(valor_total_custo, -1), coalesce(vlr_custo_aquisicao, -1)
      order by id
    ) as ordem
  from venda_itens
)
select count(*) as linhas_a_remover
from duplicados
where ordem > 1;

-- 2) Só depois de conferir o número acima — remove de fato, mantendo a
--    linha de menor id de cada grupo duplicado.
with duplicados as (
  select
    id,
    row_number() over (
      partition by
        venda_id, codigo_produto, quantidade_produtos, valor_total_bruto, valor_total_liquido,
        coalesce(vlr_custo_produto, -1), coalesce(valor_total_custo, -1), coalesce(vlr_custo_aquisicao, -1)
      order by id
    ) as ordem
  from venda_itens
)
delete from venda_itens
where id in (select id from duplicados where ordem > 1);
