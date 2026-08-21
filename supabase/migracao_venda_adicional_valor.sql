-- ============================================================
-- Migração pra rodar no projeto Supabase REAL (21/08/2026) — adiciona
-- o VALOR (R$) de cada venda de Venda Adicional, que até agora só
-- rastreava quantidade. Usado no ranking/resumo por vendedor (Alertas
-- e na própria aba Venda Adicional).
--
-- `valor` vai no FIM do select de propósito: create or replace view só
-- aceita ACRESCENTAR coluna no fim, não inserir no meio (senão o
-- Postgres interpreta como tentativa de renomear coluna existente e dá
-- erro 42P16 — mesmo problema já visto na migração de oferta diária).
-- ============================================================

create or replace view vw_venda_adicional_vendas as
select
  cvap.campanha_id,
  vi.id as venda_item_id,
  v.data_emissao,
  v.hora_emissao,
  vi.codigo_produto,
  pc.nome as nome_produto,
  vi.quantidade_produtos as quantidade,
  v.codigo_vendedor,
  vd.nome as nome_vendedor,
  v.codigo_cliente,
  c.nome as nome_cliente,
  v.id as venda_id,
  v.numero_nota,
  (select count(*) from venda_itens vi2 where vi2.venda_id = vi.venda_id) as qtd_itens_na_venda,
  (
    select string_agg(distinct coalesce(pc2.nome, 'Produto ' || vi2.codigo_produto), ', ')
    from venda_itens vi2
    left join produto_catalogo pc2 on pc2.codigo = vi2.codigo_produto
    where vi2.venda_id = vi.venda_id and vi2.id <> vi.id
  ) as outros_produtos_na_venda,
  vi.valor_total_liquido as valor
from campanha_venda_adicional_produtos cvap
join campanhas_venda_adicional camp on camp.id = cvap.campanha_id
join venda_itens vi on vi.codigo_produto = cvap.codigo_produto
join vendas v on v.id = vi.venda_id and v.data_emissao between camp.data_inicio and camp.data_fim
left join produto_catalogo pc on pc.codigo = vi.codigo_produto
left join vendedores vd on vd.codigo = v.codigo_vendedor
left join clientes c on c.codigo = v.codigo_cliente;

-- ---------- VERIFICAÇÃO (opcional, só leitura) ----------
-- select * from vw_venda_adicional_vendas order by data_emissao desc limit 20;
