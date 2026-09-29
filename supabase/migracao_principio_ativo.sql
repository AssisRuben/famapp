-- ============================================================
-- Princípio ativo no catálogo (29/09/2026) — fase 2 de equivalentes
--
-- Fase 1 (migracao_produto_irmaos.sql) agrupa só cadastros de NOME
-- idêntico. A fase 2 agrupa marcas diferentes do mesmo medicamento
-- (Novalgina x Dipirona Medley x Dipirona EMS), e pra isso precisa do
-- princípio ativo, que a Trier manda em ProdutoIntegracaoDto
-- .nomePrincipioAtivo e até agora não era gravado.
--
-- Preenchimento medido em 29/09/2026 (coletor/inspecionar_principio_
-- ativo_pedidos.js): genérico 99%, controlados/antimicrobianos 100%,
-- similar 75%, ético 64% — perfumaria/fraldas/leites ~0% (esses
-- continuam só com a regra de nome da fase 1).
--
-- Gravado normalizado (maiúsculo, espaços colapsados, vazio = null) pelo
-- coletor — sgf-produto-diario.n8n.json e backfill_periodo.js.
-- Idempotente.
-- ============================================================
alter table produto_catalogo
  add column if not exists principio_ativo text;

create index if not exists idx_produto_catalogo_principio_ativo
  on produto_catalogo (principio_ativo)
  where principio_ativo is not null;

comment on column produto_catalogo.principio_ativo is
  'Princípio ativo (Trier nomePrincipioAtivo), maiúsculo e sem espaço duplo. Base da equivalência entre marcas — sozinho NÃO basta: junta doses/formas diferentes (ver fase 2 de equivalentes).';
