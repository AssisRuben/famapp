select codigo, nome, categoria, grupo, tipo_lista from produto_catalogo where codigo = 7833;

select count(*) as qtd_vendas, coalesce(sum(vi.quantidade_produtos), 0) as unidades, max(v.data_emissao) as ultima_venda
from venda_itens vi
join vendas v on v.id = vi.venda_id
where vi.codigo_produto = 7833
  and v.data_emissao >= current_date - 90;
