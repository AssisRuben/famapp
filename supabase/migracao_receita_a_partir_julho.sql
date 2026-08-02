-- ============================================================
-- Migração pra rodar no projeto Supabase REAL — controle de receita
-- passa a valer a partir de 01/07/2026, continuando pra frente.
--
-- Histórico anterior (jan-jun/2026) é perdoado: a funcionalidade de
-- receita nunca funcionou de verdade antes (bug da tabela `produtos`
-- vazia, corrigido em migracao_receita_automatica.sql), então tratar
-- esse período como "pendência" geraria milhares de casos que não
-- são uma falha real do vendedor — ninguém tinha como anexar receita
-- numa tela que não achava nenhum produto controlado.
-- ============================================================

create or replace view vw_vendas_receita_status as
select
  vi.id as venda_item_id,
  v.data_emissao as data_venda,
  pc.codigo as codigo_produto,
  pc.nome as nome_produto,
  case when trim(pc.tipo_lista) = 'T' then 'antimicrobiano' else 'controle_especial' end as tipo_receita,
  v.codigo_cliente,
  c.nome as nome_cliente,
  v.codigo_vendedor,
  vd.nome as nome_vendedor,
  (r.id is not null) as receita_anexada,
  r.data_anexo,
  r.foto_url
from venda_itens vi
join vendas v on v.id = vi.venda_id
join produto_catalogo pc on pc.codigo = vi.codigo_produto and nullif(trim(pc.tipo_lista), '') is not null
left join clientes c on c.codigo = v.codigo_cliente
left join vendedores vd on vd.codigo = v.codigo_vendedor
left join venda_item_receitas r on r.venda_item_id = vi.id
where v.data_emissao >= '2026-07-01';

-- ---------- VERIFICAÇÃO (opcional, só leitura) ----------
-- select tipo_receita, receita_anexada, count(*)
-- from vw_vendas_receita_status
-- group by tipo_receita, receita_anexada;
