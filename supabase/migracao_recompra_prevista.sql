-- ============================================================
-- Recompra prevista de uso contínuo (30/09/2026, Fase A)
--
-- Reescreve vw_clientes_produtos_vendedor ("Meus clientes") e
-- vw_clientes_produtos (Clientes / card de Alertas) — MESMAS colunas de
-- antes, na mesma ordem (o app continua lendo igual), + colunas novas no
-- fim. O que muda:
--
-- 1) Agrupa por REMÉDIO EQUIVALENTE, não por código: quem compra
--    Losartana 50mg 30cp de laboratórios diferentes a cada mês é o mesmo
--    uso contínuo (chave = produto_catalogo.chave_equivalencia; sem chave,
--    cai pro código do produto). codigo_produto/nome_produto = o da compra
--    mais recente do grupo.
-- 2) Intervalo = MEDIANA dos intervalos entre dias de compra (uma compra
--    fora do padrão não distorce), só com 3+ compras (antes: média, 2+).
-- 3) "atrasado" vira "hora de recomprar", AVISO ANTECIPADO: da previsão
--    menos 3 dias até a previsão mais 15. Antes só avisava com o
--    intervalo + 25 dias de atraso (reativo). Mais de 15 dias além da
--    previsão sai da lista — provavelmente parou ou trocou de farmácia
--    (isso é assunto do "Cliente para resgate", não de recompra).
--    O nome da coluna fica "atrasado" pra não quebrar o app.
-- 4) Venda cancelada/devolvida não conta (o resto do app filtra desde
--    26/08/2026; essas views nunca filtraram).
-- 5) exige_receita: receita/controlado/antimicrobiano -> o app mostra
--    como "lembrete de uso contínuo", sem oferta (regra das campanhas).
--
-- + vw_uso_continuo_conversao: contato de uso contínuo que virou compra
--   do mesmo remédio (qualquer marca equivalente) em até 7 dias.
--
-- Idempotente. Rodar depois de migracao_chave_equivalencia.sql.
-- ============================================================

create or replace view vw_clientes_produtos as
with compras as (
  select
    v.codigo_cliente,
    coalesce(pc.chave_equivalencia, 'COD:' || vi.codigo_produto) as chave_grupo,
    vi.codigo_produto,
    coalesce(pc.nome, 'Produto ' || vi.codigo_produto) as nome_produto,
    pc.categoria,
    pc.grupo,
    (nullif(trim(pc.tipo_lista), '') is not null
      or upper(coalesce(pc.grupo, '')) ~ 'CONTROLAD|ANTIMICROB') as exige_receita,
    v.data_emissao
  from vendas v
  join venda_itens vi on vi.venda_id = v.id
  left join produto_catalogo pc on pc.codigo = vi.codigo_produto
  where v.codigo_cliente is not null
    and v.tipo_cancelamento is null
    and vi.quantidade_produtos > 0
    and coalesce(pc.categoria, '') <> 'SERVICOS'
    and coalesce(pc.nome, '') !~* 'entrega|delivery|frete'
),
-- um dia de compra por cliente x remédio (duas notas no mesmo dia = uma compra)
dias as (
  select distinct codigo_cliente, chave_grupo, data_emissao
  from compras
),
intervalos as (
  select
    codigo_cliente, chave_grupo,
    data_emissao - lag(data_emissao) over (partition by codigo_cliente, chave_grupo order by data_emissao) as intervalo
  from dias
),
estatistica as (
  select
    codigo_cliente, chave_grupo,
    count(*) + 1 as qtd_compras,  -- n intervalos = n compras - 1
    percentile_cont(0.5) within group (order by intervalo) as mediana_dias
  from intervalos
  where intervalo is not null
  group by 1, 2
),
agregado as (
  select
    c.codigo_cliente,
    c.chave_grupo,
    -- o produto/nome da compra mais recente representa o grupo
    (array_agg(c.codigo_produto order by c.data_emissao desc, c.codigo_produto))[1] as codigo_produto,
    (array_agg(c.nome_produto order by c.data_emissao desc, c.codigo_produto))[1] as nome_produto,
    (array_agg(c.categoria order by c.data_emissao desc, c.codigo_produto))[1] as categoria,
    (array_agg(c.grupo order by c.data_emissao desc, c.codigo_produto))[1] as grupo,
    bool_or(c.exige_receita) as exige_receita,
    count(distinct c.data_emissao) as qtd_compras,
    max(c.data_emissao) as ultima_compra
  from compras c
  group by 1, 2
)
select
  a.codigo_cliente,
  a.codigo_produto,
  a.nome_produto,
  a.categoria,
  a.grupo,
  a.qtd_compras,
  a.ultima_compra,
  round(e.mediana_dias::numeric, 1) as intervalo_medio_dias,
  (current_date - a.ultima_compra) as dias_desde_ultima_compra,
  (a.qtd_compras >= 2) as recorrente,
  -- "hora de recomprar": previsão - 3 dias até previsão + 15 dias
  (
    a.qtd_compras >= 3
    and e.mediana_dias >= 5
    and (current_date - a.ultima_compra) between e.mediana_dias - 3 and e.mediana_dias + 15
  ) as atrasado,
  -- colunas novas (30/09/2026) — sempre no fim
  a.chave_grupo,
  case when a.qtd_compras >= 3 and e.mediana_dias >= 5
    then a.ultima_compra + round(e.mediana_dias)::int end as previsao_proxima,
  case when a.qtd_compras >= 3 and e.mediana_dias >= 5
    then (a.ultima_compra + round(e.mediana_dias)::int) - current_date end as dias_para_previsao,
  a.exige_receita
from agregado a
left join estatistica e using (codigo_cliente, chave_grupo);

comment on view vw_clientes_produtos is
  'Remédio/produto recorrente por cliente, agrupado por equivalência (chave_equivalencia). atrasado = hora de recomprar (previsão -3 a +15 dias, mediana com 3+ compras). dias_para_previsao < 0 = já passou da data prevista.';

-- "Meus clientes": o mesmo cálculo (sobre TODAS as compras do cliente,
-- de qualquer vendedor — o hábito é do cliente), uma linha por vendedor
-- que já vendeu aquele remédio pra aquele cliente.
create or replace view vw_clientes_produtos_vendedor as
with vendedores_do_grupo as (
  select distinct
    v.codigo_vendedor,
    v.codigo_cliente,
    coalesce(pc.chave_equivalencia, 'COD:' || vi.codigo_produto) as chave_grupo
  from vendas v
  join venda_itens vi on vi.venda_id = v.id
  left join produto_catalogo pc on pc.codigo = vi.codigo_produto
  where v.codigo_vendedor is not null
    and v.codigo_cliente is not null
    and v.tipo_cancelamento is null
)
select
  vg.codigo_vendedor,
  cp.codigo_cliente,
  cp.codigo_produto,
  cp.nome_produto,
  cp.categoria,
  cp.grupo,
  cp.qtd_compras,
  cp.ultima_compra,
  cp.intervalo_medio_dias,
  cp.dias_desde_ultima_compra,
  cp.recorrente,
  cp.atrasado,
  cp.chave_grupo,
  cp.previsao_proxima,
  cp.dias_para_previsao,
  cp.exige_receita
from vw_clientes_produtos cp
join vendedores_do_grupo vg using (codigo_cliente, chave_grupo);

-- Conversão: contato de uso contínuo (contatos_clientes) seguido de
-- compra do MESMO remédio — mesmo código ou marca equivalente — em até 7
-- dias. Uma linha por contato.
create or replace view vw_uso_continuo_conversao as
select
  cc.id as contato_id,
  cc.codigo_cliente,
  cc.codigo_vendedor,
  cc.codigo_produto,
  cc.tipo_contato,
  cc.contatado_em,
  exists (
    select 1
    from vendas v
    join venda_itens vi on vi.venda_id = v.id
    left join produto_catalogo pv on pv.codigo = vi.codigo_produto
    where v.codigo_cliente = cc.codigo_cliente
      and v.tipo_cancelamento is null
      and v.data_emissao between (cc.contatado_em at time zone 'America/Sao_Paulo')::date
                             and (cc.contatado_em at time zone 'America/Sao_Paulo')::date + 7
      and (
        vi.codigo_produto = cc.codigo_produto
        or (pc.chave_equivalencia is not null and pv.chave_equivalencia = pc.chave_equivalencia)
      )
  ) as converteu
from contatos_clientes cc
left join produto_catalogo pc on pc.codigo = cc.codigo_produto
where cc.motivo = 'uso_continuo'
  and cc.tipo_contato in ('whatsapp', 'ligacao');

comment on view vw_uso_continuo_conversao is
  'Contato de uso contínuo que virou compra do mesmo remédio (mesmo código ou marca equivalente) em até 7 dias.';

alter view vw_clientes_produtos set (security_invoker = true);
alter view vw_clientes_produtos_vendedor set (security_invoker = true);
alter view vw_uso_continuo_conversao set (security_invoker = true);
