-- Migração: card "Produto em promoção" (aba Alertas) passa a considerar
-- também campanhas ATIVAS HOJE criadas na aba Campanhas do app
-- (campanhas/campanha_produtos), não só a tabela `produtos`
-- (curadoria manual separada, flag em_promocao). Idempotente.

create or replace view vw_produtos_promocao_clientes as
with produtos_em_promocao as (
  select
    p.codigo as codigo_produto,
    p.nome as nome_produto,
    p.preco_atual,
    p.preco_anterior,
    p.percentual_desconto,
    p.exige_receita,
    p.tipo_receita
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
    end as tipo_receita
  from campanha_produtos cp
  join campanhas camp on camp.id = cp.campanha_id
  join produto_catalogo pc on pc.codigo = cp.codigo_produto
  where current_date between camp.data_inicio and camp.data_fim
)
select
  pp.codigo_produto,
  pp.nome_produto,
  pp.preco_atual,
  pp.preco_anterior,
  pp.percentual_desconto,
  c.codigo as codigo_cliente,
  c.nome as nome_cliente,
  c.fone as telefone_cliente,
  max(v.data_emissao) as ultima_compra_produto,
  sum(vi.quantidade_produtos) as quantidade_total,
  pp.exige_receita,
  pp.tipo_receita
from produtos_em_promocao pp
join venda_itens vi on vi.codigo_produto = pp.codigo_produto
join vendas v on v.id = vi.venda_id
join clientes c on c.codigo = v.codigo_cliente
group by pp.codigo_produto, pp.nome_produto, pp.preco_atual, pp.preco_anterior, pp.percentual_desconto,
  c.codigo, c.nome, c.fone, pp.exige_receita, pp.tipo_receita;
