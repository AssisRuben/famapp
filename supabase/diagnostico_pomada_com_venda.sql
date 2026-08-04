select pc.codigo, pc.nome, count(*) as qtd_vendas, max(v.data_emissao) as ultima_venda
from produto_catalogo pc
join venda_itens vi on vi.codigo_produto = pc.codigo
join vendas v on v.id = vi.venda_id
where (
    pc.nome ilike '%assadura%' or pc.nome ilike '%hipoglos%' or pc.nome ilike '%bepantol%'
    or pc.nome ilike '%drapolene%' or pc.nome ilike '%dermodex%' or pc.nome ilike '%vitam%'
  )
  and v.data_emissao >= current_date - 90
group by pc.codigo, pc.nome
order by qtd_vendas desc
limit 10;
