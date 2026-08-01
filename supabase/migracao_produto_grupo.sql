-- ============================================================
-- Migração pra rodar no projeto Supabase REAL — separa "categoria"
-- (ProdutoIntegracaoDto.nomeCategoria, tipo de uso, ex. "Uso Adulto")
-- de "grupo" (nomeGrupo, ex. "Analgésicos", "Fraldas" — o campo
-- realmente útil pra filtro de produto/categoria). Rodar ANTES de
-- reaplicar migracao_filtros_resgate.sql.
--
-- Depois de rodar isso, "grupo" só fica preenchido depois do PRÓXIMO
-- sync de produto — rode `ENTIDADES=produto node backfill_periodo.js`
-- no terminal do coletor pra preencher todo mundo de uma vez (produto
-- não é sincronizado pelo workflow n8n recorrente, só pelo backfill).
-- ============================================================

alter table produto_catalogo add column if not exists grupo text;
create index if not exists idx_produto_catalogo_grupo on produto_catalogo (grupo);
