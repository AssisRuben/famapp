-- ============================================================
-- Migração pra rodar no projeto Supabase REAL — cria a view usada
-- pelos filtros de resgate ("Uso contínuo" + categoria/produto) da
-- tela "Meus clientes" (01/08/2026).
--
-- Depende de produto_catalogo.grupo — rodar
-- migracao_produto_grupo.sql ANTES desta.
-- ============================================================

drop view if exists vw_clientes_produtos_vendedor;
create view vw_clientes_produtos_vendedor as
with compras as (
  select
    v.codigo_vendedor,
    v.codigo_cliente,
    vi.codigo_produto,
    coalesce(pc.nome, 'Produto ' || vi.codigo_produto) as nome_produto,
    pc.categoria,
    pc.grupo,
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
    count(*) as qtd_compras,
    max(data_emissao) as ultima_compra,
    (max(data_emissao) - min(data_emissao))::numeric / nullif(count(*) - 1, 0) as intervalo_medio_dias
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

alter view vw_clientes_produtos_vendedor set (security_invoker = true);

-- ---------- VERIFICAÇÃO (opcional, só leitura) ----------
-- select count(*) from vw_clientes_produtos_vendedor where atrasado;
-- select distinct grupo from produto_catalogo where grupo is not null order by 1 limit 50;
