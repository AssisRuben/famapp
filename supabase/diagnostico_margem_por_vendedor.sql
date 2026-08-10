-- ============================================================
-- Diagnóstico (só leitura) — margem por vendedor no mesmo período do
-- relatório real da Trier (01/08 a 10/08/2026), com a fórmula corrigida
-- (custo × 0.92), pra comparar linha a linha contra o relatório e
-- confirmar que a soma dos vendedores bate com o total.
-- ============================================================

select
  vi.codigo_vendedor,
  vend.nome as nome_vendedor,
  count(distinct v.id) as qtd_vendas,
  round(sum(coalesce(vi.vlr_custo_produto, vi.valor_total_custo, vi.vlr_custo_aquisicao)) * 0.92, 2) as custo,
  round(sum(vi.valor_total_liquido), 2) as venda_liquida,
  round(sum(vi.valor_total_liquido) - sum(coalesce(vi.vlr_custo_produto, vi.valor_total_custo, vi.vlr_custo_aquisicao)) * 0.92, 2) as margem
from venda_itens vi
join vendas v on v.id = vi.venda_id
join vendedores vend on vend.codigo = vi.codigo_vendedor
where v.data_emissao between '2026-08-01' and '2026-08-10'
  and vi.codigo_vendedor is not null
group by vi.codigo_vendedor, vend.nome
order by margem desc;
