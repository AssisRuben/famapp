-- ============================================================
-- Migração pra rodar no projeto Supabase REAL — cria as views usadas
-- pela nova tela "Meus clientes" (01/08/2026, substitui a aba
-- Ranking — o ranking virou parte do Painel).
--
-- Depende da coluna clientes.data_nascimento — rodar
-- migracao_clientes_data_nascimento.sql ANTES desta.
--
-- drop view if exists: seguro rodar de novo mesmo se a versão
-- anterior (sem email/data_nascimento, histórico por nota em vez de
-- por produto) já tiver sido aplicada.
-- ============================================================

drop view if exists vw_clientes_por_vendedor;
create view vw_clientes_por_vendedor as
select
  v.codigo_vendedor,
  c.codigo,
  c.nome,
  c.fone as telefone,
  c.email,
  c.data_nascimento,
  count(distinct v.id) as qtd_compras,
  sum(vi.valor_total_liquido) as valor_total,
  max(v.data_emissao) as ultima_compra
from vendas v
join venda_itens vi on vi.venda_id = v.id
join clientes c on c.codigo = v.codigo_cliente
where v.codigo_vendedor is not null and v.codigo_cliente is not null
group by v.codigo_vendedor, c.codigo, c.nome, c.fone, c.email, c.data_nascimento;

drop view if exists vw_historico_compras_cliente;
create view vw_historico_compras_cliente as
select
  v.codigo_cliente,
  vi.id as item_id,
  v.id as venda_id,
  v.data_emissao,
  vi.codigo_produto,
  coalesce(pc.nome, 'Produto ' || vi.codigo_produto) as nome_produto,
  vi.quantidade_produtos,
  vi.valor_total_liquido
from vendas v
join venda_itens vi on vi.venda_id = v.id
left join produto_catalogo pc on pc.codigo = vi.codigo_produto
where v.codigo_cliente is not null;

alter view vw_clientes_por_vendedor set (security_invoker = true);
alter view vw_historico_compras_cliente set (security_invoker = true);
