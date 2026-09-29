-- ============================================================
-- Equivalentes entre marcas — chave + view (29/09/2026, fase 2 etapa 2)
--
-- Fase 1 (migracao_produto_irmaos.sql): mesmo NOME, código diferente.
-- Fase 2: marcas diferentes do mesmo medicamento na mesma apresentação
-- (Novalgina 1G 10CP = Dipirona EMS 1G 10CP = Maxalgina 1G 10CP).
--
-- A chave NÃO é calculada aqui: vem pronta do coletor
-- (coletor/chaveEquivalencia.js, usado por sgf-produto-diario.n8n.json
-- e backfill_periodo.js), no formato
--   principio_ativo|concentração|forma|modificadores|quantidade
-- Motivo: a leitura de dose/forma/embalagem a partir do nome foi
-- validada em JS contra o catálogo real (5.967 medicamentos, 76% com
-- chave, testes em coletor/testar_chave_equivalencia.js) — reescrever
-- em regex do Postgres seria uma segunda implementação pra divergir.
-- Chave null = sem equivalente confiável (produto só agrupa pela fase 1).
--
-- troca_restrita: princípios ativos de faixa terapêutica estreita, em que
-- trocar de marca/laboratório exige acompanhamento médico. Continuam
-- aparecendo como alternativa, mas quem consome NÃO deve somar demanda
-- entre marcas nem tratar uma como cobertura automática da outra.
--
-- Rodar DEPOIS de migracao_principio_ativo.sql. Idempotente.
-- ============================================================
alter table produto_catalogo
  add column if not exists chave_equivalencia text;

create index if not exists idx_produto_catalogo_chave_equivalencia
  on produto_catalogo (chave_equivalencia)
  where chave_equivalencia is not null;

comment on column produto_catalogo.chave_equivalencia is
  'principio_ativo|concentração|forma|modificadores|quantidade — calculada no coletor (coletor/chaveEquivalencia.js). Mesma chave = mesmo medicamento e apresentação, outra marca. Null = sem equivalente confiável.';

create or replace view vw_produto_equivalentes
with (security_invoker = true) as
with base as (
  select
    pc.codigo,
    pc.nome,
    trim(pc.grupo) as grupo,
    pc.chave_equivalencia as chave,
    greatest(pc.estoque_atual, 0) as estoque,
    pc.custo_medio,
    pc.preco_venda
  from produto_catalogo pc
  where pc.chave_equivalencia is not null
),
grupos as (
  select
    chave,
    count(*) as qtd_cadastros,
    sum(estoque) as estoque_grupo,
    array_agg(codigo order by codigo) as codigos_grupo,
    jsonb_agg(
      jsonb_build_object(
        'codigo', codigo, 'nome', nome, 'grupo', grupo, 'estoque', estoque,
        'custo_medio', custo_medio, 'preco_venda', preco_venda
      )
      order by estoque desc, custo_medio, codigo
    ) filter (where estoque > 0) as cadastros_com_estoque
  from base
  group by chave
  having count(*) > 1
)
select
  b.codigo,
  g.chave,
  split_part(g.chave, '|', 1) as principio_ativo,
  g.qtd_cadastros,
  -- estoque dos OUTROS códigos equivalentes (exclui o próprio)
  (g.estoque_grupo - b.estoque) as estoque_equivalentes,
  g.codigos_grupo,
  g.cadastros_com_estoque,
  split_part(g.chave, '|', 1) ~ (
    'LEVOTIROXINA|VARFARINA|FENITOINA|CARBAMAZEPINA|CARBONATO DE LITIO|DIGOXINA|'
    || 'CICLOSPORINA|TACROLIMO|VALPRO|DIVALPROEX|LAMOTRIGINA|TEOFILINA|FENOBARBITAL'
  ) as troca_restrita
from base b
join grupos g using (chave);

comment on view vw_produto_equivalentes is
  'Cadastros de OUTRAS marcas do mesmo medicamento e apresentação (mesma chave_equivalencia). Só aparecem produtos com pelo menos 1 equivalente. troca_restrita = faixa terapêutica estreita: mostrar como alternativa, não somar demanda nem tratar como cobertura.';
