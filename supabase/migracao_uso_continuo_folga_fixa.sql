-- ============================================================
-- "Atrasado" (uso contínuo/resgate) trocou de intervalo médio × 1.3
-- (30% de tolerância) pra intervalo médio + 25 dias de folga fixa.
-- Mesmas colunas de antes (create-or-replace só muda a conta do
-- boolean, não a lista de colunas) — usada por vw_clientes_produtos_vendedor
-- ("Meus clientes") e vw_clientes_produtos ("Cliente para resgate").
-- ============================================================

create or replace view vw_clientes_produtos_vendedor as
with compras as (
  select
    v.codigo_vendedor,
    v.codigo_cliente,
    vi.codigo_produto,
    coalesce(pc.nome, 'Produto ' || vi.codigo_produto) as nome_produto,
    pc.categoria,
    pc.grupo,
    v.id as venda_id,
    v.data_emissao
  from vendas v
  join venda_itens vi on vi.venda_id = v.id
  left join produto_catalogo pc on pc.codigo = vi.codigo_produto
  where v.codigo_vendedor is not null and v.codigo_cliente is not null
    and coalesce(pc.categoria, '') <> 'SERVICOS'
    and coalesce(pc.nome, '') !~* 'entrega|delivery|frete'
),
agregado as (
  select
    codigo_vendedor,
    codigo_cliente,
    codigo_produto,
    nome_produto,
    categoria,
    grupo,
    count(distinct venda_id) as qtd_compras,
    max(data_emissao) as ultima_compra,
    (max(data_emissao) - min(data_emissao))::numeric / nullif(count(distinct venda_id) - 1, 0) as intervalo_medio_dias
  from compras
  group by codigo_vendedor, codigo_cliente, codigo_produto, nome_produto, categoria, grupo
)
select
  codigo_vendedor,
  codigo_cliente,
  codigo_produto,
  nome_produto,
  categoria,
  grupo,
  qtd_compras,
  ultima_compra,
  round(intervalo_medio_dias, 1) as intervalo_medio_dias,
  (current_date - ultima_compra) as dias_desde_ultima_compra,
  (qtd_compras >= 2) as recorrente,
  (
    qtd_compras >= 2
    and intervalo_medio_dias is not null
    and (current_date - ultima_compra) > intervalo_medio_dias + 25
  ) as atrasado
from agregado;

create or replace view vw_clientes_produtos as
with compras as (
  select
    v.codigo_cliente,
    vi.codigo_produto,
    coalesce(pc.nome, 'Produto ' || vi.codigo_produto) as nome_produto,
    pc.categoria,
    pc.grupo,
    v.id as venda_id,
    v.data_emissao
  from vendas v
  join venda_itens vi on vi.venda_id = v.id
  left join produto_catalogo pc on pc.codigo = vi.codigo_produto
  where v.codigo_cliente is not null
    and coalesce(pc.categoria, '') <> 'SERVICOS'
    and coalesce(pc.nome, '') !~* 'entrega|delivery|frete'
),
agregado as (
  select
    codigo_cliente,
    codigo_produto,
    nome_produto,
    categoria,
    grupo,
    count(distinct venda_id) as qtd_compras,
    max(data_emissao) as ultima_compra,
    (max(data_emissao) - min(data_emissao))::numeric / nullif(count(distinct venda_id) - 1, 0) as intervalo_medio_dias
  from compras
  group by codigo_cliente, codigo_produto, nome_produto, categoria, grupo
)
select
  codigo_cliente,
  codigo_produto,
  nome_produto,
  categoria,
  grupo,
  qtd_compras,
  ultima_compra,
  round(intervalo_medio_dias, 1) as intervalo_medio_dias,
  (current_date - ultima_compra) as dias_desde_ultima_compra,
  (qtd_compras >= 2) as recorrente,
  (
    qtd_compras >= 2
    and intervalo_medio_dias is not null
    and (current_date - ultima_compra) > intervalo_medio_dias + 25
  ) as atrasado
from agregado;
