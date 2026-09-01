-- Migração pra rodar no projeto Supabase REAL (26/08/2026, corrigida
-- no mesmo dia) — vw_produtos_promocao_clientes.
--
-- Tentativa inicial escopou o join de DESCOBERTA de cliente (quem já
-- comprou antes) pelo período da ação — errado: produto cuja última
-- venda foi ANTES da promoção começar sumia da lista inteira (achado:
-- card foi de "todos os produtos em campanha" pra só 16, com produto
-- de verdade faltando). "já comprou antes" tem que continuar sendo o
-- histórico INTEIRO — sem isso não sobra ninguém pra contatar num
-- produto que nunca vendeu desde que a promoção começou.
--
-- quantidade_vendida_periodo é uma métrica À PARTE, por PRODUTO (não
-- por cliente) — quantidade vendida só DENTRO do período da ação,
-- pra mostrar no card sem afetar quem aparece na lista de clientes.
create or replace view vw_produtos_promocao_clientes as
with produtos_em_promocao as (
  select
    p.codigo as codigo_produto,
    p.nome as nome_produto,
    p.preco_atual,
    p.preco_anterior,
    p.percentual_desconto,
    p.exige_receita,
    p.tipo_receita,
    p.updated_at::date as periodo_inicio
  from produtos p
  where p.em_promocao = true

  union all

  select
    cp.codigo_produto,
    pc.nome as nome_produto,
    cp.preco_promocional as preco_atual,
    case
      when cp.percentual_desconto > 0 then round(cp.preco_promocional / (1 - cp.percentual_desconto / 100), 2)
      else cp.preco_promocional
    end::numeric(12,2) as preco_anterior,
    cp.percentual_desconto,
    (nullif(trim(pc.tipo_lista), '') is not null) as exige_receita,
    case
      when trim(pc.tipo_lista) = 'T' then 'antimicrobiano'
      when nullif(trim(pc.tipo_lista), '') is not null then 'controle_especial'
      else null
    end as tipo_receita,
    coalesce(cp.data_inicio, camp.data_inicio) as periodo_inicio
  from campanha_produtos cp
  join campanhas camp on camp.id = cp.campanha_id
  join produto_catalogo pc on pc.codigo = cp.codigo_produto
  where current_date between camp.data_inicio and camp.data_fim
),
vendido_no_periodo as (
  select pp.codigo_produto, sum(vi.quantidade_produtos) as quantidade_vendida_periodo
  from produtos_em_promocao pp
  join venda_itens vi on vi.codigo_produto = pp.codigo_produto
  join vendas v on v.id = vi.venda_id
    and v.data_emissao >= pp.periodo_inicio
    and v.tipo_cancelamento is null
  group by pp.codigo_produto
)
select
  pp.codigo_produto,
  pp.nome_produto,
  pp.preco_atual,
  pp.preco_anterior,
  pp.percentual_desconto,
  c.codigo as codigo_cliente,
  c.nome as nome_cliente,
  coalesce(c.celular, c.fone) as telefone_cliente,
  max(v.data_emissao) as ultima_compra_produto,
  sum(vi.quantidade_produtos) as quantidade_total,
  pp.exige_receita,
  pp.tipo_receita,
  -- por último de propósito: create or replace view só deixa
  -- ACRESCENTAR coluna no fim, não inserir no meio.
  coalesce(vp.quantidade_vendida_periodo, 0) as quantidade_vendida_periodo
from produtos_em_promocao pp
join venda_itens vi on vi.codigo_produto = pp.codigo_produto
join vendas v on v.id = vi.venda_id and v.tipo_cancelamento is null
join clientes c on c.codigo = v.codigo_cliente
left join vendido_no_periodo vp on vp.codigo_produto = pp.codigo_produto
group by pp.codigo_produto, pp.nome_produto, pp.preco_atual, pp.preco_anterior, pp.percentual_desconto,
  c.codigo, c.nome, c.fone, c.celular, pp.exige_receita, pp.tipo_receita, vp.quantidade_vendida_periodo;
