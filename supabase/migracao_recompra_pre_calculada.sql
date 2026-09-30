-- ============================================================
-- Recompra pré-calculada: Alertas e Clientes abrindo rápido (29/09/2026)
--
-- Problema: migracao_recompra_prevista.sql deixou vw_clientes_produtos
-- (e vw_clientes_produtos_vendedor, que é montada em cima dela) calculando
-- TODO o histórico de vendas a cada consulta — window function + mediana
-- por cliente x remédio, sobre vendas x venda_itens x produto_catalogo.
-- E o app lê essas views PAGINADO (buscarPaginado, 1000 linhas por vez):
-- cada página refazia o cálculo inteiro. Resultado: Alertas, Clientes e
-- Meus clientes demorando pra abrir e, no login da Wanessa, estourando o
-- tempo limite — Alertas inteiro em 0.
--
-- Solução (mesmo padrão de produto_afinidade / fn_recalcular_afinidade):
--   - cliente_produto_habito: o cálculo pesado (qtd de compras, última
--     compra, mediana do intervalo), 1 linha por cliente x remédio
--     equivalente;
--   - cliente_produto_vendedor: quais vendedores já venderam aquele
--     remédio pra aquele cliente;
--   - fn_recalcular_clientes_produtos(): refaz as duas tabelas — chamada
--     pelo n8n a cada 30 min (coletor/recompra_recalculo.n8n.json), logo
--     depois do sync de vendas;
--   - as duas views continuam com o MESMO nome e as MESMAS colunas, na
--     mesma ordem — o app não muda. Só o que depende de "hoje" (dias
--     desde a última compra, hora de recomprar, dias pra previsão) é
--     calculado na leitura, então nunca fica defasado de um dia pro outro.
--
-- Bônus: "hoje" agora é a data de Brasília. current_date do banco é UTC —
-- depois das 21h já é o dia seguinte e todo "dias desde" pulava 1.
--
-- Defasagem: uma compra feita agora só tira o cliente de "Hora de
-- recomprar" no próximo recálculo (até 30 min + o sync de 15 min).
--
-- Idempotente. Rodar DEPOIS de migracao_recompra_prevista.sql.
-- ============================================================

create table if not exists cliente_produto_habito (
  codigo_cliente integer not null,
  chave_grupo text not null,
  codigo_produto integer not null,
  nome_produto text,
  categoria text,
  grupo text,
  exige_receita boolean not null default false,
  qtd_compras bigint not null,
  ultima_compra date not null,
  mediana_dias double precision,  -- null com menos de 2 compras
  calculado_em timestamptz not null default now(),
  primary key (codigo_cliente, chave_grupo)
);

-- ordem de leitura do app (.order codigo_cliente, codigo_produto)
create index if not exists cliente_produto_habito_ordem_idx
  on cliente_produto_habito (codigo_cliente, codigo_produto);

create table if not exists cliente_produto_vendedor (
  codigo_vendedor integer not null,
  codigo_cliente integer not null,
  chave_grupo text not null,
  primary key (codigo_vendedor, codigo_cliente, chave_grupo)
);

alter table cliente_produto_habito enable row level security;
alter table cliente_produto_vendedor enable row level security;

-- mesma regra de vendas/venda_itens (rls_policies.sql): qualquer usuário
-- logado do app lê
drop policy if exists "cliente_produto_habito: usuarios autenticados leem" on cliente_produto_habito;
create policy "cliente_produto_habito: usuarios autenticados leem"
on cliente_produto_habito for select
using (exists (select 1 from profiles p where p.id = auth.uid()));

drop policy if exists "cliente_produto_vendedor: usuarios autenticados leem" on cliente_produto_vendedor;
create policy "cliente_produto_vendedor: usuarios autenticados leem"
on cliente_produto_vendedor for select
using (exists (select 1 from profiles p where p.id = auth.uid()));

-- ------------------------------------------------------------
-- Recálculo: o MESMO cálculo de migracao_recompra_prevista.sql, só que
-- gravado em tabela. delete + insert na mesma transação: quem está lendo
-- continua vendo a versão anterior até o fim (sem tela vazia no meio).
-- ------------------------------------------------------------
create or replace function fn_recalcular_clientes_produtos()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  create temporary table tmp_compras on commit drop as
  select
    v.codigo_cliente,
    v.codigo_vendedor,
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
    and coalesce(pc.nome, '') !~* 'entrega|delivery|frete';

  delete from cliente_produto_habito;

  insert into cliente_produto_habito (
    codigo_cliente, chave_grupo, codigo_produto, nome_produto, categoria, grupo,
    exige_receita, qtd_compras, ultima_compra, mediana_dias
  )
  with dias as (
    -- um dia de compra por cliente x remédio (duas notas no mesmo dia = uma compra)
    select distinct codigo_cliente, chave_grupo, data_emissao
    from tmp_compras
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
    from tmp_compras c
    group by 1, 2
  )
  select
    a.codigo_cliente, a.chave_grupo, a.codigo_produto, a.nome_produto, a.categoria, a.grupo,
    coalesce(a.exige_receita, false), a.qtd_compras, a.ultima_compra, e.mediana_dias
  from agregado a
  left join estatistica e using (codigo_cliente, chave_grupo);

  get diagnostics n = row_count;

  delete from cliente_produto_vendedor;

  insert into cliente_produto_vendedor (codigo_vendedor, codigo_cliente, chave_grupo)
  select distinct codigo_vendedor, codigo_cliente, chave_grupo
  from tmp_compras
  where codigo_vendedor is not null;

  return n;
end;
$$;

-- recálculo pesado: só o n8n (postgres/service role) chama — nunca o app
revoke all on function fn_recalcular_clientes_produtos() from public, anon, authenticated;

-- ------------------------------------------------------------
-- Views: mesmas colunas, mesma ordem, mesmos tipos de antes.
-- ------------------------------------------------------------
create or replace view vw_clientes_produtos as
with hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d)
select
  h.codigo_cliente,
  h.codigo_produto,
  h.nome_produto,
  h.categoria,
  h.grupo,
  h.qtd_compras,
  h.ultima_compra,
  round(h.mediana_dias::numeric, 1) as intervalo_medio_dias,
  (hoje.d - h.ultima_compra) as dias_desde_ultima_compra,
  (h.qtd_compras >= 2) as recorrente,
  -- "hora de recomprar": previsão - 3 dias até previsão + 15 dias
  (
    h.qtd_compras >= 3
    and h.mediana_dias >= 5
    and (hoje.d - h.ultima_compra) between h.mediana_dias - 3 and h.mediana_dias + 15
  ) as atrasado,
  h.chave_grupo,
  case when h.qtd_compras >= 3 and h.mediana_dias >= 5
    then h.ultima_compra + round(h.mediana_dias)::int end as previsao_proxima,
  case when h.qtd_compras >= 3 and h.mediana_dias >= 5
    then (h.ultima_compra + round(h.mediana_dias)::int) - hoje.d end as dias_para_previsao,
  h.exige_receita
from cliente_produto_habito h
cross join hoje;

comment on view vw_clientes_produtos is
  'Remédio/produto recorrente por cliente, agrupado por equivalência (chave_equivalencia). Lê cliente_produto_habito (pré-calculada pelo n8n a cada 30 min via fn_recalcular_clientes_produtos). atrasado = hora de recomprar (previsão -3 a +15 dias, mediana com 3+ compras).';

create or replace view vw_clientes_produtos_vendedor as
select
  cv.codigo_vendedor,
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
from cliente_produto_vendedor cv
join vw_clientes_produtos cp using (codigo_cliente, chave_grupo);

alter view vw_clientes_produtos set (security_invoker = true);
alter view vw_clientes_produtos_vendedor set (security_invoker = true);

-- vw_uso_continuo_conversao procura compra do cliente na semana seguinte
-- ao contato — sem índice por cliente+data varre vendas inteira.
create index if not exists vendas_cliente_data_idx on vendas (codigo_cliente, data_emissao);

-- primeira carga (a partir daqui, o n8n mantém)
select fn_recalcular_clientes_produtos() as linhas_gravadas;
