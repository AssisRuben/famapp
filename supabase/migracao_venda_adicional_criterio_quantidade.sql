-- ============================================================
-- Migração pra rodar no projeto Supabase REAL — se campanhas_venda_adicional
-- já foi criada (migracao_venda_adicional.sql), isso adiciona o
-- critério de quantidade (03/08/2026):
--
--   'acumulado_periodo' (padrão, comportamento de antes) — soma tudo
--   que o vendedor vendeu no período inteiro.
--
--   'mesma_venda' — só conta o MAIOR cupom individual de cada
--   vendedor. Pra premiar "vendeu 2 [de um produto] juntas na mesma
--   venda", não "vendeu 1 hoje + 1 semana que vem".
--
-- Também expõe venda_id/numero_nota na view (precisa pra agrupar por
-- cupom no critério 'mesma_venda').
--
-- Idempotente — pode rodar de novo sem erro.
-- ============================================================

alter table campanhas_venda_adicional
  add column if not exists criterio_quantidade text not null default 'acumulado_periodo';

alter table campanhas_venda_adicional
  drop constraint if exists campanhas_venda_adicional_criterio_quantidade_check;
alter table campanhas_venda_adicional
  add constraint campanhas_venda_adicional_criterio_quantidade_check
  check (criterio_quantidade in ('acumulado_periodo', 'mesma_venda'));

-- Colunas novas (venda_id, numero_nota) vão no FIM da lista de
-- propósito — create or replace view só aceita ACRESCENTAR coluna no
-- final, não inserir no meio (Postgres trata isso como "renomear"
-- coluna existente e recusa: erro 42P16, já visto rodando essa
-- migração).
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
  v.numero_nota
from campanha_venda_adicional_produtos cvap
join campanhas_venda_adicional camp on camp.id = cvap.campanha_id
join venda_itens vi on vi.codigo_produto = cvap.codigo_produto
join vendas v on v.id = vi.venda_id and v.data_emissao between camp.data_inicio and camp.data_fim
left join produto_catalogo pc on pc.codigo = vi.codigo_produto
left join vendedores vd on vd.codigo = v.codigo_vendedor
left join clientes c on c.codigo = v.codigo_cliente;

alter view vw_venda_adicional_vendas set (security_invoker = true);

-- ---------- VERIFICAÇÃO (opcional, só leitura) ----------
-- select column_name, column_default from information_schema.columns
-- where table_name = 'campanhas_venda_adicional' and column_name = 'criterio_quantidade';
