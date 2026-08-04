-- ============================================================
-- Apaga a campanha de teste "com outro item" e cria uma nova pro
-- critério 'mesma_venda' (03/08/2026) — meta individual: só bate a
-- meta quem vender 2+ unidades do MESMO produto juntas na mesma
-- venda (mesmo cupom), não acumulado ao longo do período. É o
-- cenário original "vendeu 2x Glifage, ganha R$50".
-- ============================================================

delete from campanhas_venda_adicional where nome ilike 'Teste (com outro item)%';

with produto_teste as (
  select vi.codigo_produto, pc.nome, count(*) as qtd_vendas
  from venda_itens vi
  join vendas v on v.id = vi.venda_id
  left join produto_catalogo pc on pc.codigo = vi.codigo_produto
  where v.data_emissao >= current_date - 30
    and coalesce(pc.categoria, '') <> 'SERVICOS'
    and coalesce(pc.nome, '') !~* 'entrega|delivery|frete'
  group by vi.codigo_produto, pc.nome
  order by qtd_vendas desc
  limit 1
),
nova_campanha as (
  insert into campanhas_venda_adicional
    (nome, data_inicio, data_fim, tipo_premiacao, criterio_quantidade, meta_quantidade, premiacao_meta_valor)
  select
    'Teste (mesma venda, 2+) — ' || produto_teste.nome,
    current_date - 30,
    current_date + 14,
    'meta_individual',
    'mesma_venda',
    2,
    50
  from produto_teste
  returning id
)
insert into campanha_venda_adicional_produtos (campanha_id, codigo_produto)
select nova_campanha.id, produto_teste.codigo_produto
from nova_campanha, produto_teste;

-- ---------- VERIFICAÇÃO (opcional, só leitura) ----------
-- Maior cupom individual de cada vendedor pra esse produto — é o que
-- decide quem bate a meta de 2 (>=2 nessa coluna = bateu):
-- select codigo_vendedor, nome_vendedor, venda_id, sum(quantidade) as qtd_na_venda
-- from vw_venda_adicional_vendas
-- where campanha_id = (select id from campanhas_venda_adicional order by criada_em desc limit 1)
-- group by codigo_vendedor, nome_vendedor, venda_id
-- order by qtd_na_venda desc
-- limit 20;
