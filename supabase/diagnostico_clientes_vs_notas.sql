-- ============================================================
-- Diagnóstico (só leitura) — testa a hipótese de que "Qtd. Vendas" no
-- relatório da Trier é na verdade CLIENTES DISTINTOS atendidos, não
-- número de notas. Se qtd_clientes_distintos bater com o relatório
-- (Rafaela=289, por ex.) e qtd_notas for maior, não é bug nenhum — é
-- cliente que comprou mais de uma vez no período.
-- ============================================================

select
  vi.codigo_vendedor,
  vend.nome,
  count(distinct v.id) as qtd_notas,
  count(distinct v.codigo_cliente) as qtd_clientes_distintos,
  count(vi.id) as qtd_itens_linha,
  round(sum(vi.quantidade_produtos), 2) as total_unidades
from venda_itens vi
join vendas v on v.id = vi.venda_id
join vendedores vend on vend.codigo = vi.codigo_vendedor
where v.data_emissao between '2026-08-01' and '2026-08-10'
  and vi.codigo_vendedor is not null
group by vi.codigo_vendedor, vend.nome
order by qtd_notas desc;
