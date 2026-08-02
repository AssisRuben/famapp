-- ============================================================
-- Migração pra rodar no projeto Supabase REAL — corrige
-- vw_clientes_produtos_vendedor (usada em "Meus clientes" pro
-- filtro de uso contínuo / atrasado).
--
-- Bug: qtd_compras contava LINHAS de venda_itens, não vendas
-- distintas. Quando uma nota tem o mesmo produto em 2+ linhas
-- (bonificação, lote diferente, split de item na Trier etc.), isso
-- inflava qtd_compras artificialmente — e como min(data_emissao) =
-- max(data_emissao) nesse caso, intervalo_medio_dias virava 0,
-- fazendo o cliente ser marcado "atrasado" no dia seguinte à
-- primeira compra. Confirmado com uma query real: 20 pares
-- cliente+produto com linhas > vendas_distintas (ex.: cliente 9508 /
-- produto 1954 com 10 linhas em só 8 vendas).
--
-- Fix: count(distinct venda_id) no lugar de count(*), tanto pra
-- qtd_compras quanto pro divisor de intervalo_medio_dias.
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
    and (current_date - ultima_compra) > intervalo_medio_dias * 1.3
  ) as atrasado
from agregado;

-- ---------- VERIFICAÇÃO (opcional, só leitura) ----------
-- Confirma que sumiram os casos qtd_compras inflado (compara com a
-- query de diagnóstico usada pra achar o bug):
-- select codigo_cliente, codigo_produto, qtd_compras, intervalo_medio_dias, dias_desde_ultima_compra, atrasado
-- from vw_clientes_produtos_vendedor
-- where codigo_cliente in (9508, 158, 3736, 243, 2489)
-- order by codigo_cliente, codigo_produto;
