-- ============================================================
-- Migração pra rodar no projeto Supabase REAL — cria vw_clientes_produtos,
-- usada pelos filtros (busca por produto, grupo, "Uso contínuo") da
-- tela "Cliente para resgate" (03/08/2026).
--
-- Mesma base de vw_clientes_produtos_vendedor (já existe, usada em
-- "Meus clientes"), mas agregada por CLIENTE, não por vendedor — a
-- tela "Cliente para resgate" mostra todo cliente pra qualquer
-- vendedor agir, então "recorrente"/"atrasado" precisam somar a compra
-- do cliente com QUALQUER vendedor, não só a de quem está logado.
-- ============================================================

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
    and (current_date - ultima_compra) > intervalo_medio_dias * 1.3
  ) as atrasado
from agregado;

alter view vw_clientes_produtos set (security_invoker = true);

-- ---------- VERIFICAÇÃO (opcional, só leitura) ----------
-- select count(*) from vw_clientes_produtos where atrasado;
