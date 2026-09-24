-- Diagnóstico pro motor de campanhas por lucro incremental (23/09/2026).
-- Só leitura. Janela: últimos 2 anos (decisão do usuário).
-- Rodar as duas queries separadamente no SQL Editor do Supabase.

-- ============================================================
-- QUERY 1 — Cobertura de elasticidade por grupo
-- Quantos produtos (com estoque hoje) têm variação de preço suficiente
-- pra medir elasticidade PRÓPRIA, quantos vão usar a da CATEGORIA e
-- quantos não têm dado nenhum.
--   preço relativo = preço médio praticado na semana ÷ preço mediano do
--   produto nos 2 anos (neutraliza reajuste/inflação do período).
--   elasticidade = inclinação de ln(qtd) × ln(preço relativo); normal
--   é negativa (preço cai → venda sobe). -2 = 10% de desconto sobe ~20%.
-- ============================================================
with semanas as (
  select
    vi.codigo_produto,
    date_trunc('week', v.data_emissao)::date as semana,
    sum(vi.quantidade_produtos) as qtd,
    sum(vi.valor_total_liquido) / nullif(sum(vi.quantidade_produtos), 0) as preco_medio
  from venda_itens vi
  join vendas v on v.id = vi.venda_id
  where v.tipo_cancelamento is null
    and v.data_emissao >= current_date - interval '2 years'
    and vi.quantidade_produtos > 0
    and vi.valor_total_liquido > 0
  group by 1, 2
),
mediana as (
  select codigo_produto, percentile_cont(0.5) within group (order by preco_medio) as preco_mediano
  from semanas
  group by 1
),
por_produto as (
  select
    s.codigo_produto,
    count(*) as semanas_com_venda,
    sum(s.qtd) as qtd_2anos,
    count(*) filter (where s.preco_medio / m.preco_mediano <= 0.95) as semanas_com_desconto,
    regr_slope(ln(s.qtd), ln(s.preco_medio / m.preco_mediano)) as elasticidade,
    regr_r2(ln(s.qtd), ln(s.preco_medio / m.preco_mediano)) as r2
  from semanas s
  join mediana m using (codigo_produto)
  where m.preco_mediano > 0
  group by 1
),
classificado as (
  select
    c.codigo,
    trim(c.grupo) as grupo,
    p.elasticidade,
    case
      when p.semanas_com_venda >= 26 and p.semanas_com_desconto >= 4 and p.elasticidade < 0 then 'propria'
      when p.semanas_com_venda >= 8 then 'categoria'
      else 'sem_dados'
    end as fonte
  from produto_catalogo c
  left join por_produto p on p.codigo_produto = c.codigo
  where c.estoque_atual > 0
)
select
  grupo,
  count(*) as produtos_com_estoque,
  count(*) filter (where fonte = 'propria') as elasticidade_propria,
  count(*) filter (where fonte = 'categoria') as usa_categoria,
  count(*) filter (where fonte = 'sem_dados') as sem_dados,
  round((percentile_cont(0.5) within group (order by elasticidade) filter (where fonte = 'propria'))::numeric, 2) as elasticidade_mediana
from classificado
group by grupo
order by produtos_com_estoque desc;


-- ============================================================
-- QUERY 2 — Backtest das campanhas já feitas
-- Por campanha: venda/dia e lucro/dia DURANTE a campanha × 28 dias
-- ANTES, só dos produtos promovidos. "previsto" = o que a elasticidade
-- do produto (calculada só com semanas ANTERIORES ao início da
-- campanha, sem vazar o resultado) diria pro desconto aplicado. Se
-- previsto ≈ real, o modelo serve; se errar muito, fica regra simples.
-- ============================================================
with itens as (
  select
    c.id as campanha_id,
    c.nome,
    cp.codigo_produto,
    cp.percentual_desconto,
    coalesce(cp.data_inicio, c.data_inicio) as inicio,
    least(coalesce(cp.data_fim, c.data_fim), current_date - 1) as fim
  from campanhas c
  join campanha_produtos cp on cp.campanha_id = c.id
  where coalesce(cp.data_inicio, c.data_inicio) < current_date
),
vendas_dia as (
  select vi.codigo_produto, v.data_emissao as dia,
         sum(vi.quantidade_produtos) as qtd,
         sum(vi.valor_total_liquido - coalesce(vi.valor_total_custo, 0)) as lucro,
         sum(vi.valor_total_liquido) as receita
  from venda_itens vi
  join vendas v on v.id = vi.venda_id
  where v.tipo_cancelamento is null
    and v.data_emissao >= current_date - interval '2 years'
    and vi.quantidade_produtos > 0
    and vi.codigo_produto in (select codigo_produto from itens)
  group by 1, 2
),
-- venda/lucro por dia: durante × 28 dias antes
periodos as (
  select
    i.campanha_id, i.codigo_produto,
    coalesce(sum(d.qtd) filter (where d.dia between i.inicio and i.fim), 0) / greatest(i.fim - i.inicio + 1, 1) as qtd_dia_campanha,
    coalesce(sum(d.qtd) filter (where d.dia < i.inicio), 0) / 28.0 as qtd_dia_antes,
    coalesce(sum(d.lucro) filter (where d.dia between i.inicio and i.fim), 0) / greatest(i.fim - i.inicio + 1, 1) as lucro_dia_campanha,
    coalesce(sum(d.lucro) filter (where d.dia < i.inicio), 0) / 28.0 as lucro_dia_antes
  from itens i
  left join vendas_dia d on d.codigo_produto = i.codigo_produto and d.dia between i.inicio - 28 and i.fim
  group by i.campanha_id, i.codigo_produto, i.inicio, i.fim
),
-- semanas completas ANTES do início de cada campanha
semanas_antes as (
  select i.campanha_id, i.codigo_produto, date_trunc('week', d.dia)::date as semana,
         sum(d.qtd) as qtd, sum(d.receita) / nullif(sum(d.qtd), 0) as preco
  from itens i
  join vendas_dia d on d.codigo_produto = i.codigo_produto and d.dia < date_trunc('week', i.inicio)::date
  group by 1, 2, 3
),
mediana_antes as (
  select campanha_id, codigo_produto, percentile_cont(0.5) within group (order by preco) as preco_mediano
  from semanas_antes
  where preco > 0
  group by 1, 2
),
elasticidade_antes as (
  select s.campanha_id, s.codigo_produto,
         regr_slope(ln(s.qtd), ln(s.preco / m.preco_mediano)) as elasticidade
  from semanas_antes s
  join mediana_antes m using (campanha_id, codigo_produto)
  where s.qtd > 0 and s.preco > 0 and m.preco_mediano > 0
  group by 1, 2
)
select
  i.campanha_id,
  i.nome,
  count(*) as produtos,
  round(avg(i.percentual_desconto), 1) as desconto_medio_pct,
  round((sum(p.qtd_dia_campanha) / nullif(sum(p.qtd_dia_antes), 0) - 1) * 100, 1) as aumento_venda_real_pct,
  round((percentile_cont(0.5) within group (order by power(1 - i.percentual_desconto / 100.0, e.elasticidade) - 1)
         filter (where e.elasticidade < 0))::numeric * 100, 1) as aumento_previsto_mediano_pct,
  count(*) filter (where e.elasticidade < 0) as produtos_com_previsao,
  round(sum(p.lucro_dia_campanha) - sum(p.lucro_dia_antes), 2) as lucro_incremental_por_dia
from itens i
join periodos p using (campanha_id, codigo_produto)
left join elasticidade_antes e using (campanha_id, codigo_produto)
group by i.campanha_id, i.nome
order by i.campanha_id;


-- ============================================================
-- QUERY 3 — Backtest COM grupo de controle (23/09/2026)
-- A Query 2 compara a campanha com o passado do próprio produto, o que
-- confunde efeito de desconto com sazonalidade: a campanha 7 (desconto
-- ZERO, só acompanhamento) caiu 40% em volume sem nenhuma intervenção,
-- provando que a 2a quinzena de setembro cai sozinha.
-- Aqui a variação dos produtos promovidos é comparada com a dos produtos
-- NÃO promovidos dos MESMOS grupos, no MESMO período. O que sobra
-- (efeito_liquido_pct) é o efeito da campanha, já descontado o movimento
-- geral do mercado.
-- ============================================================
with itens as (
  select
    c.id as campanha_id,
    c.nome,
    cp.codigo_produto,
    coalesce(cp.data_inicio, c.data_inicio) as inicio,
    least(coalesce(cp.data_fim, c.data_fim), current_date - 1) as fim
  from campanhas c
  join campanha_produtos cp on cp.campanha_id = c.id
  where coalesce(cp.data_inicio, c.data_inicio) < current_date
),
janela as (
  select campanha_id, nome, min(inicio) as inicio, max(fim) as fim
  from itens
  group by 1, 2
),
-- controle: produtos dos mesmos grupos que NÃO entraram na campanha
controle as (
  select distinct g.campanha_id, pc.codigo
  from (
    select distinct i.campanha_id, trim(pc.grupo) as grupo
    from itens i
    join produto_catalogo pc on pc.codigo = i.codigo_produto
  ) g
  join produto_catalogo pc on trim(pc.grupo) = g.grupo
  where not exists (
    select 1 from itens i
    where i.campanha_id = g.campanha_id and i.codigo_produto = pc.codigo
  )
),
vendas_dia as (
  select vi.codigo_produto, v.data_emissao as dia, sum(vi.quantidade_produtos) as qtd
  from venda_itens vi
  join vendas v on v.id = vi.venda_id
  where v.tipo_cancelamento is null
    and v.data_emissao >= current_date - interval '2 years'
    and vi.quantidade_produtos > 0
  group by 1, 2
),
promovidos as (
  select j.campanha_id,
    coalesce(sum(d.qtd) filter (where d.dia between j.inicio and j.fim), 0) / greatest(j.fim - j.inicio + 1, 1) as dur,
    coalesce(sum(d.qtd) filter (where d.dia between j.inicio - 28 and j.inicio - 1), 0) / 28.0 as ant
  from janela j
  join itens i on i.campanha_id = j.campanha_id
  left join vendas_dia d on d.codigo_produto = i.codigo_produto and d.dia between j.inicio - 28 and j.fim
  group by j.campanha_id, j.inicio, j.fim
),
nao_promovidos as (
  select j.campanha_id,
    coalesce(sum(d.qtd) filter (where d.dia between j.inicio and j.fim), 0) / greatest(j.fim - j.inicio + 1, 1) as dur,
    coalesce(sum(d.qtd) filter (where d.dia between j.inicio - 28 and j.inicio - 1), 0) / 28.0 as ant
  from janela j
  join controle c on c.campanha_id = j.campanha_id
  left join vendas_dia d on d.codigo_produto = c.codigo and d.dia between j.inicio - 28 and j.fim
  group by j.campanha_id, j.inicio, j.fim
)
select
  j.campanha_id,
  j.nome,
  j.inicio,
  j.fim,
  round((p.dur / nullif(p.ant, 0) - 1) * 100, 1) as var_promovidos_pct,
  round((n.dur / nullif(n.ant, 0) - 1) * 100, 1) as var_controle_pct,
  round(((p.dur / nullif(p.ant, 0)) / nullif(n.dur / nullif(n.ant, 0), 0) - 1) * 100, 1) as efeito_liquido_pct
from janela j
join promovidos p using (campanha_id)
join nao_promovidos n using (campanha_id)
order by j.campanha_id;
