-- Migração pra rodar no projeto Supabase REAL (26/08/2026) —
-- vw_venda_complementar_marcada ganha venda_id, pra distinguir
-- "quantidade de itens marcados" de "quantidade de atendimentos"
-- (uma nota pode ter 2+ itens marcados como complementar na mesma
-- venda — sem isso não dava pra saber quantos atendimentos DISTINTOS
-- geraram aquele total de itens).
create or replace view vw_venda_complementar_marcada as
select
  vic.venda_item_id,
  vic.codigo_vendedor,
  vd.nome as nome_vendedor,
  v.data_emissao,
  vi.valor_total_liquido as valor,
  vi.codigo_produto,
  v.id as venda_id
from venda_item_complementar vic
join venda_itens vi on vi.id = vic.venda_item_id
join vendas v on v.id = vi.venda_id
left join vendedores vd on vd.codigo = vic.codigo_vendedor;

alter view vw_venda_complementar_marcada set (security_invoker = false);
