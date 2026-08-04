-- ============================================================
-- Migração pra rodar no projeto Supabase REAL — se produtos_em_falta
-- já foi criada (migracao_produtos_em_falta.sql), isso corrige o
-- desenho: nome_produto passa a ser TEXTO LIVRE (obrigatório), e
-- codigo_produto vira OPCIONAL (03/08/2026, achado com caso real:
-- produto novo no mercado, ainda sem cadastro em produto_catalogo,
-- não tinha como ser reportado com codigo_produto obrigatório).
--
-- Preenche nome_produto pros registros já existentes (busca em
-- produto_catalogo pelo codigo_produto que já estava salvo) antes de
-- tornar a coluna NOT NULL.
--
-- Idempotente — pode rodar de novo sem erro.
-- ============================================================

alter table produtos_em_falta
  add column if not exists nome_produto text;

update produtos_em_falta pf
set nome_produto = coalesce(pc.nome, 'Produto ' || pf.codigo_produto)
from produto_catalogo pc
where pc.codigo = pf.codigo_produto
  and pf.nome_produto is null;

-- registro que sobrou sem bater com produto_catalogo (não deveria
-- acontecer, mas evita erro no NOT NULL abaixo se acontecer)
update produtos_em_falta
set nome_produto = 'Produto ' || codigo_produto
where nome_produto is null;

alter table produtos_em_falta
  alter column nome_produto set not null;

alter table produtos_em_falta
  alter column codigo_produto drop not null;

-- ---------- VERIFICAÇÃO (opcional, só leitura) ----------
-- select id, nome_produto, codigo_produto, data from produtos_em_falta order by data desc;
