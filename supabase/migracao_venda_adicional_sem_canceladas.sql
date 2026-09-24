-- ============================================================
-- Venda adicional: não contar venda cancelada/devolvida (24/09/2026)
--
-- vw_venda_adicional_vendas (ranking/meta/prêmio da aba Venda Adicional
-- e de Alertas) nunca filtrou vendas.tipo_cancelamento — todo o resto
-- do app filtra desde 26/08/2026. Achado real na venda adicional 10
-- ("16 a 30/09"): Terezinha e Wanessa tinham 1 unidade cancelada cada;
-- com ela, Wanessa aparecia sozinha em 2º (13) quando na verdade
-- empata com Rafaela e Tiago em 12 — prêmio de 2º/3º lugar errado.
--
-- Base: migracao_venda_adicional_valor.sql (versão mais recente).
-- Única mudança: `and v.tipo_cancelamento is null` no join com vendas.
-- Mesmas colunas, mesma ordem — create or replace funciona direto.
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
  and v.tipo_cancelamento is null  -- 24/09/2026
left join produto_catalogo pc on pc.codigo = vi.codigo_produto
left join vendedores vd on vd.codigo = v.codigo_vendedor
left join clientes c on c.codigo = v.codigo_cliente;

alter view vw_venda_adicional_vendas set (security_invoker = true);
