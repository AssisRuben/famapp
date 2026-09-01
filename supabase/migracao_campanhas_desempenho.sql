-- Migração pra rodar no projeto Supabase REAL (26/08/2026) — nova view
-- vw_campanhas_desempenho, que alimenta a lista em CampanhasScreen com
-- quantidade VENDIDA e valor durante o período da campanha (antes só
-- mostrava quantidade de produtos CADASTRADOS, um dado estático).
--
-- Mesmo critério de join usado em calcular_metricas_mes
-- (ia_venda_campanha/agr_venda_campanha): casa por codigo_produto
-- dentro da janela de validade EFETIVA do item (coalesce com a
-- validade da campanha), exclui venda cancelada/devolvida.
create or replace view vw_campanhas_desempenho as
select
  cp.campanha_id,
  sum(vi.quantidade_produtos) as quantidade_vendida,
  sum(vi.valor_total_liquido) as valor_vendido
from campanha_produtos cp
join campanhas c on c.id = cp.campanha_id
join venda_itens vi on vi.codigo_produto = cp.codigo_produto
join vendas v on v.id = vi.venda_id
  and v.data_emissao between coalesce(cp.data_inicio, c.data_inicio) and coalesce(cp.data_fim, c.data_fim)
where v.codigo_vendedor is not null
  and v.tipo_cancelamento is null
group by cp.campanha_id;

alter view vw_campanhas_desempenho set (security_invoker = true);
