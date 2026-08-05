-- Migração: fornecedor com o menor preço histórico pago por produto
-- (complementa vw_produto_fornecedor_recente, que é sempre o
-- fornecedor da compra MAIS RECENTE, não o mais barato).
-- Idempotente: pode rodar de novo sem problema.

drop view if exists vw_produto_fornecedor_mais_barato;

create view vw_produto_fornecedor_mais_barato as
select distinct on (ci.codigo_produto)
  ci.codigo_produto,
  c.codigo_fornecedor,
  f.nome_fantasia as nome_fornecedor,
  ci.valor_custo,
  c.data_entrada
from compras_itens ci
join compras c on c.id = ci.compra_id
join fornecedores f on f.codigo = c.codigo_fornecedor
where c.data_entrada >= now() - interval '12 months'
  and ci.valor_custo is not null
  and ci.valor_custo > 0
order by ci.codigo_produto, ci.valor_custo asc, c.data_entrada desc;

alter view vw_produto_fornecedor_mais_barato set (security_invoker = true);
