select v.codigo_vendedor, vd.nome as nome_vendedor, count(*) as qtd_vendas, sum(vi.quantidade_produtos) as unidades
from venda_itens vi
join vendas v on v.id = vi.venda_id
left join vendedores vd on vd.codigo = v.codigo_vendedor
where vi.codigo_produto = 22043
  and v.data_emissao >= current_date - 30
group by v.codigo_vendedor, vd.nome
order by unidades desc;
