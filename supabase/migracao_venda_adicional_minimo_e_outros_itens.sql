-- ============================================================
-- Migração pra rodar no projeto Supabase REAL (03/08/2026):
--
-- 1) minimo_para_concorrer — piso mínimo pra entrar no ranking (ex.:
--    "concorre a partir de 5"), editável na aba do gestor. Só vale pro
--    tipo 'ranking'; null = sem piso.
--
-- 2) outros_produtos_na_venda na view — nomes dos OUTROS produtos que
--    vieram na mesma nota (fora os da campanha), pra mostrar na lista
--    "com o que essa venda veio junto" — sem isso não dava pra saber
--    o que era o "outro item" que fez a venda contar no critério
--    'venda_com_outros_itens'.
--
-- Idempotente — pode rodar de novo sem erro.
-- ============================================================

alter table campanhas_venda_adicional
  add column if not exists minimo_para_concorrer integer;

alter table campanhas_venda_adicional
  drop constraint if exists campanhas_venda_adicional_minimo_para_concorrer_check;
alter table campanhas_venda_adicional
  add constraint campanhas_venda_adicional_minimo_para_concorrer_check
  check (minimo_para_concorrer > 0);

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
  ) as outros_produtos_na_venda
from campanha_venda_adicional_produtos cvap
join campanhas_venda_adicional camp on camp.id = cvap.campanha_id
join venda_itens vi on vi.codigo_produto = cvap.codigo_produto
join vendas v on v.id = vi.venda_id and v.data_emissao between camp.data_inicio and camp.data_fim
left join produto_catalogo pc on pc.codigo = vi.codigo_produto
left join vendedores vd on vd.codigo = v.codigo_vendedor
left join clientes c on c.codigo = v.codigo_cliente;

alter view vw_venda_adicional_vendas set (security_invoker = true);

-- ---------- VERIFICAÇÃO (opcional, só leitura) ----------
-- select venda_id, nome_produto, outros_produtos_na_venda, qtd_itens_na_venda
-- from vw_venda_adicional_vendas
-- where campanha_id = 6 and codigo_vendedor = 5
-- order by data_emissao desc;
