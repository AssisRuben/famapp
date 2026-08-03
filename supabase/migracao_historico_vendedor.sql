-- ============================================================
-- Migração pra rodar no projeto Supabase REAL — inclui
-- codigo_vendedor/nome_vendedor em vw_historico_compras_cliente, pra
-- tela "Cliente para resgate" mostrar quem atendeu cada compra do
-- histórico, ao lado da data (pedido 03/08/2026). left join em
-- vendedores porque venda pode não ter vendedor atribuído (mesma
-- inconsistência proposital documentada em seed_data.sql).
--
-- Idempotente (create or replace), seguro rodar mais de uma vez.
-- ============================================================

create or replace view vw_historico_compras_cliente as
select
  v.codigo_cliente,
  vi.id as item_id,
  v.id as venda_id,
  v.data_emissao,
  vi.codigo_produto,
  coalesce(pc.nome, 'Produto ' || vi.codigo_produto) as nome_produto,
  vi.quantidade_produtos,
  vi.valor_total_liquido,
  v.codigo_vendedor,
  vd.nome as nome_vendedor
from vendas v
join venda_itens vi on vi.venda_id = v.id
left join produto_catalogo pc on pc.codigo = vi.codigo_produto
left join vendedores vd on vd.codigo = v.codigo_vendedor
where v.codigo_cliente is not null;

alter view vw_historico_compras_cliente set (security_invoker = true);

-- ---------- VERIFICAÇÃO (opcional, só leitura) ----------
-- select * from vw_historico_compras_cliente order by data_emissao desc limit 10;
