-- ============================================================
-- Motor de campanhas — PRÉVIA v2 (só leitura, 23/09/2026)
--
-- CRITÉRIO: valor de cliente recorrente em jogo.
--
-- Por que não margem/giro/lucro incremental (v1, descartada):
--   - Ranquear por margem selecionou produtos cujo preco_venda de
--     TABELA é ficção (Losartana com "94% de margem" vendendo a R$4,57
--     na vida real). O motor chegou a propor R$22,49 de "promoção" pra
--     um produto que sai a R$4,57 — um aumento de 5x.
--   - Com a margem REAL (35,2% na média da farmácia), a condição
--     |elasticidade| > 1/margem não fecha em NENHUM grupo: desconto não
--     aumenta lucro no item promovido, em lugar nenhum.
--   - O encarte de setembro confirmou: desconto real de 60-93% em 270
--     produtos, efeito líquido de -5,4% no volume. Não há o que ganhar
--     baixando mais o preço.
--
-- O que sobra e faz sentido: campanha não serve pra lucrar naquela
-- venda, serve pra CAPTURAR CLIENTE RECORRENTE. Um cliente de uso
-- contínuo vale ~12 vendas/ano, todo ano. Por isso o ranking é por
-- quanto valor recorrente cada produto controla.
--
-- REGRAS DE SEGURANÇA que a v1 não tinha:
--   1. Preço de referência = PRATICADO (mediana real de 90 dias),
--      nunca produto_catalogo.preco_venda
--   2. Uma apresentação por molécula (a v1 colocou Losartana no
--      controle E no desconto — um braço canibalizava o outro)
--   3. Sem serviço, taxa e recarga de celular
--   4. Estoque cobrindo pelo menos 2x a demanda do período
--   5. Compra confirmada nos últimos 12 meses (custo confiável)
-- ============================================================

with parametros as (
  select
    0.15::numeric as desconto_alvo,             -- 15% SOBRE O PRATICADO
    0.15::numeric as margem_minima_resultante,  -- piso depois do desconto
    3.0::numeric  as cobertura_estoque,         -- estoque >= 3x demanda do período
    5             as min_clientes,              -- piso estatístico
    30::numeric   as taxa_recompra_minima,      -- uso contínuo de verdade
    0.30::numeric as margem_minima_elegivel,    -- pra o desconto ser visível
    10            as estoque_minimo_abs,
    15            as dias_campanha,
    50            as qtd_candidatos
),

-- Preço que a farmácia REALMENTE cobra (não o de tabela)
preco_praticado as (
  select
    vi.codigo_produto,
    (percentile_cont(0.5) within group (
      order by vi.valor_total_liquido / nullif(vi.quantidade_produtos, 0)))::numeric as praticado,
    sum(vi.quantidade_produtos) as qtd_90d
  from venda_itens vi
  join vendas v on v.id = vi.venda_id
  where v.data_emissao >= current_date - interval '90 days'
    and v.tipo_cancelamento is null
    and vi.quantidade_produtos > 0
    and vi.valor_total_liquido > 0
  group by 1
),

-- Custo confirmado por compra recente
compra_recente as (
  select distinct on (ci.codigo_produto)
    ci.codigo_produto, c.data_entrada::date as data_compra
  from compras_itens ci
  join compras c on c.id = ci.compra_id
  where c.data_entrada >= current_date - interval '12 months'
    and ci.valor_unitario_liquido > 0
  order by ci.codigo_produto, c.data_entrada desc
),

-- Comportamento de recompra por cliente, 12 meses
compras_cliente as (
  select
    vi.codigo_produto,
    v.codigo_cliente,
    count(*) as vezes,
    (max(v.data_emissao) - min(v.data_emissao))::numeric as span_dias
  from venda_itens vi
  join vendas v on v.id = vi.venda_id
  where v.data_emissao >= current_date - interval '12 months'
    and v.tipo_cancelamento is null
    and v.codigo_cliente is not null
    and vi.quantidade_produtos > 0
  group by 1, 2
),
recompra as (
  select
    codigo_produto,
    count(*) as clientes,
    count(*) filter (where vezes >= 2) as clientes_recorrentes,
    round(count(*) filter (where vezes >= 2)::numeric / nullif(count(*), 0) * 100, 1) as taxa_recompra_pct,
    round(avg(span_dias / nullif(vezes - 1, 0)) filter (where vezes >= 2 and span_dias > 0), 0) as intervalo_dias
  from compras_cliente
  group by 1
),

elegiveis as (
  select
    pc.codigo,
    pc.nome,
    trim(pc.grupo) as grupo,
    -- família = primeira palavra do nome (a molécula): garante que
    -- Losartana A e Losartana B não caiam em braços diferentes
    split_part(trim(pc.nome), ' ', 1) as familia,
    pp.praticado,
    pc.custo_medio,
    pc.estoque_atual,
    pp.qtd_90d,
    r.clientes,
    r.clientes_recorrentes,
    r.taxa_recompra_pct,
    r.intervalo_dias,
    (pp.praticado - pc.custo_medio) / nullif(pp.praticado, 0) as margem_real,
    -- demanda esperada no período da campanha
    pp.qtd_90d / 90.0 * p.dias_campanha as demanda_periodo
  from produto_catalogo pc
  join preco_praticado pp on pp.codigo_produto = pc.codigo
  join recompra r on r.codigo_produto = pc.codigo
  join compra_recente cr on cr.codigo_produto = pc.codigo
  cross join parametros p
  where pc.estoque_atual > 0
    and pc.custo_medio > 0
    and pp.praticado > pc.custo_medio                    -- margem real positiva
    and r.clientes >= p.min_clientes
    and r.clientes_recorrentes >= 2
    -- uso contínuo DE VERDADE: recompra alta e cadência mensal.
    -- Sem isso entra antibiótico e sintomático de gripe, que repetem
    -- porque o cliente adoeceu de novo, não porque fidelizou.
    and r.taxa_recompra_pct >= p.taxa_recompra_minima
    and r.intervalo_dias between 25 and 90
    -- NUNCA controlado nem antimicrobiano: receita retida, e incentivo
    -- de venda sobre psicotrópico/antibiótico é problema legal, não só
    -- analítico. tipo_lista preenchido cobre os dois casos.
    and coalesce(nullif(trim(pc.tipo_lista), ''), '') = ''
    and trim(pc.grupo) not like '%CONTROLADOS%'
    and trim(pc.grupo) not like '%ANTIMICROBIANOS%'
    -- margem que comporte um desconto visível
    and (pp.praticado - pc.custo_medio) / nullif(pp.praticado, 0) >= p.margem_minima_elegivel
    -- fora: serviço, taxa, recarga
    and trim(pc.grupo) not in ('AMBULATORIO', 'USO OU CONSUMO.')
    and pc.nome !~* '(RECARGA|APLICACAO|APLICAÇÃO|TAXA|BONIFICA)'
    -- estoque tem que aguentar a campanha
    and pc.estoque_atual >= greatest(pp.qtd_90d / 90.0 * p.dias_campanha * p.cobertura_estoque, p.estoque_minimo_abs)
),

precificado as (
  select
    e.*,
    -- desconto SOBRE O PRATICADO, com piso de margem
    greatest(
      e.praticado * (1 - p.desconto_alvo),
      e.custo_medio / (1 - p.margem_minima_resultante)
    ) as preco_promocional,
    -- valor anual de cliente recorrente em jogo neste produto
    e.clientes_recorrentes
      * (e.praticado - e.custo_medio)
      * (365.0 / nullif(e.intervalo_dias, 0)) as valor_recorrente_ano
  from elegiveis e
  cross join parametros p
),

com_desconto as (
  select
    pr.*,
    round((1 - pr.preco_promocional / nullif(pr.praticado, 0)) * 100, 1) as desconto_pct
  from precificado pr
  where pr.preco_promocional < pr.praticado          -- só se sobra desconto pra dar
),

-- uma apresentação por molécula: a de maior valor recorrente
melhor_da_familia as (
  select distinct on (familia) *
  from com_desconto
  order by familia, valor_recorrente_ano desc
),

topo as (
  select m.*, row_number() over (order by m.valor_recorrente_ano desc) as rn
  from melhor_da_familia m
  order by m.valor_recorrente_ano desc
  limit (select qtd_candidatos from parametros)
),

-- sorteio estratificado: blocos de 5 por ranking, papel sorteado por
-- hash dentro do bloco -> os 3 braços recebem a mesma mistura
atribuido as (
  select
    t.*,
    row_number() over (partition by (t.rn - 1) / 5 order by md5(t.codigo::text)) as pos_no_bloco
  from topo t
)

select
  case
    when pos_no_bloco <= 2 then 'desconto'
    when pos_no_bloco <= 4 then 'incentivo'
    else 'controle'
  end as braco,
  codigo,
  nome,
  grupo,
  clientes,
  clientes_recorrentes,
  taxa_recompra_pct,
  intervalo_dias,
  round(praticado, 2) as praticado,
  custo_medio,
  round(margem_real * 100, 1) as margem_real_pct,
  round(preco_promocional, 2) as preco_promocional,
  desconto_pct,
  estoque_atual,
  round(valor_recorrente_ano, 2) as valor_recorrente_ano,
  -- quanto o desconto custa no período (no braço incentivo, vira prêmio)
  round(qtd_90d / 90.0 * (select dias_campanha from parametros)
        * (praticado - preco_promocional), 2) as custo_desconto_periodo
from atribuido
order by braco, valor_recorrente_ano desc;
