-- ============================================================
-- Migração pra rodar no projeto Supabase REAL — receita passa a
-- ser derivada automaticamente de produto_catalogo.tipo_lista (a
-- Trier já manda pronto), em vez de depender da tabela `produtos`
-- de curadoria manual, que nunca foi preenchida ("Receita pendente"
-- sempre dava 0).
--
-- tipoLista da ProdutoIntegracaoDto: null/vazio = comum, "T" =
-- antimicrobiano (retenção de receita), qualquer outro valor
-- (A1/A2/A3/B1/B2/C1..C5) = controle especial (psicotrópico etc.).
-- Confirmado 02/08/2026 comparando produto comum (ADALAT, tipoLista
-- null) com grupos ETICO/GENERICO CONTROLADOS (Bromazepam/Clonazepam
-- = B1, Gabapentina/Tegretol = C1) e ANTIMICROBIANOS (Bactrim/
-- Ampicilina = T).
--
-- IMPORTANTE: depois de rodar essa migração, precisa rodar de novo
-- o backfill de produtos pra preencher tipo_lista no catálogo já
-- sincronizado (o campo fica NULL pra tudo até re-sincronizar):
--   $env:ENTIDADES = 'produto'
--   node backfill_periodo.js
-- ============================================================

alter table produto_catalogo add column if not exists tipo_lista text;

create index if not exists idx_produto_catalogo_tipo_lista
  on produto_catalogo (tipo_lista) where tipo_lista is not null;

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
left join venda_item_receitas r on r.venda_item_id = vi.id;

alter view vw_vendas_receita_status set (security_invoker = true);

-- ---------- VERIFICAÇÃO (opcional, só leitura) ----------
-- Depois de rodar o backfill de produto, confere quantos produtos do
-- catálogo já vieram classificados:
-- select count(*) filter (where tipo_lista is not null) as exigem_receita, count(*) as total
-- from produto_catalogo;
--
-- E quantas vendas de item controlado aparecem agora (pendentes ou não):
-- select tipo_receita, receita_anexada, count(*)
-- from vw_vendas_receita_status
-- group by tipo_receita, receita_anexada;
