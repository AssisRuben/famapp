-- ============================================================
-- Diagnóstico (só leitura) — por que o card "Antibiótico vendido"
-- mostrou só 16 pra Terezinha (03/08/2026). Não altera nada.
-- ============================================================

with base as (
  select * from vw_vendas_receita_status
  where tipo_receita = 'antimicrobiano' and data_venda >= current_date - 7
),
parecem_antibiotico_mas_sem_tag as (
  select pc.codigo, pc.nome, pc.tipo_lista, count(*) as qtd
  from venda_itens vi
  join vendas v on v.id = vi.venda_id
  join produto_catalogo pc on pc.codigo = vi.codigo_produto
  where v.data_emissao >= current_date - 7
    and coalesce(trim(pc.tipo_lista), '') <> 'T'
    and (
      pc.nome ilike '%amoxicilina%' or pc.nome ilike '%azitromicina%' or pc.nome ilike '%cefalexina%'
      or pc.nome ilike '%ciprofloxacino%' or pc.nome ilike '%doxiciclina%' or pc.nome ilike '%claritromicina%'
      or pc.nome ilike '%penicilina%' or pc.nome ilike '%sulfametoxazol%' or pc.nome ilike '%norfloxacino%'
      or pc.nome ilike '%metronidazol%' or pc.nome ilike '%levofloxacino%' or pc.nome ilike '%fluconazol%'
      or pc.nome ilike '%cefadroxila%' or pc.nome ilike '%eritromicina%' or pc.nome ilike '%ampicilina%'
    )
  group by pc.codigo, pc.nome, pc.tipo_lista
)
select 'total_linhas_antimicrobiano_7d' as metrica, count(*)::text as valor from base
union all
select 'com_cliente_vinculado', count(*) filter (where codigo_cliente is not null)::text from base
union all
select 'sem_cliente_vinculado (não entram no card)', count(*) filter (where codigo_cliente is null)::text from base
union all
select 'pares_cliente_produto_distintos (o que o card conta)',
  count(distinct (codigo_cliente, codigo_produto))::text from base where codigo_cliente is not null
union all
select 'ja_marcados_em_contatos_clientes (motivo antibiotico)', count(*)::text
  from contatos_clientes where motivo = 'antibiotico'
union all
select 'produtos_parecem_antibiotico_mas_sem_tipo_lista_T (linhas vendidas)',
  coalesce(sum(qtd), 0)::text from parecem_antibiotico_mas_sem_tag;

-- ---------- Ver QUAIS produtos são o gap de cadastro (rode isolado) ----------
-- with parecem_antibiotico_mas_sem_tag as (
--   select pc.codigo, pc.nome, pc.tipo_lista, count(*) as qtd
--   from venda_itens vi
--   join vendas v on v.id = vi.venda_id
--   join produto_catalogo pc on pc.codigo = vi.codigo_produto
--   where v.data_emissao >= current_date - 7
--     and coalesce(trim(pc.tipo_lista), '') <> 'T'
--     and (
--       pc.nome ilike '%amoxicilina%' or pc.nome ilike '%azitromicina%' or pc.nome ilike '%cefalexina%'
--       or pc.nome ilike '%ciprofloxacino%' or pc.nome ilike '%doxiciclina%' or pc.nome ilike '%claritromicina%'
--       or pc.nome ilike '%penicilina%' or pc.nome ilike '%sulfametoxazol%' or pc.nome ilike '%norfloxacino%'
--       or pc.nome ilike '%metronidazol%' or pc.nome ilike '%levofloxacino%' or pc.nome ilike '%fluconazol%'
--       or pc.nome ilike '%cefadroxila%' or pc.nome ilike '%eritromicina%' or pc.nome ilike '%ampicilina%'
--     )
--   group by pc.codigo, pc.nome, pc.tipo_lista
-- )
-- select * from parecem_antibiotico_mas_sem_tag order by qtd desc;

-- ---------- Quebra por vendedor ----------
-- select codigo_vendedor, nome_vendedor, count(*) as vendas_antimicrobiano_7d
-- from vw_vendas_receita_status
-- where tipo_receita = 'antimicrobiano' and data_venda >= current_date - 7
-- group by codigo_vendedor, nome_vendedor
-- order by vendas_antimicrobiano_7d desc;

-- ============================================================
-- LIMPEZA (03/08/2026) — os 43 registros em contatos_clientes com
-- motivo='antibiotico' foram criados de uma vez só por um bug: o
-- efeito de auto-expiração varria TODO o histórico da view (desde
-- 01/07/2026) em vez de só os últimos ~14 dias, marcando venda de mais
-- de um mês atrás como "não contatado". Confirmado que os 43 são
-- 100% tipo_contato='nao_contatado' (nenhum contato real feito por
-- botão se perde). O bug já foi corrigido no app (ANTIBIOTICO_DIAS +
-- ANTIBIOTICO_TOLERANCIA_DIAS em AlertasScreen.tsx) — isso aqui só
-- limpa o lixo que a versão com bug já tinha gravado.
-- ============================================================
-- delete from contatos_clientes where motivo = 'antibiotico';
