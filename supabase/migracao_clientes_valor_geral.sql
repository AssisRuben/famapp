-- Corrige o card "Cliente de alto valor sumindo" em Alertas: usava
-- vw_clientes_por_vendedor (recortada por vendedor), então um cliente
-- que comprou recentemente com OUTRO vendedor entrava como "sumindo"
-- na lista de quem não foi o vendedor da última compra. Nova view soma
-- QUALQUER vendedor — oportunidade de contato pra qualquer atendente,
-- mesma família de vw_produtos_promocao_clientes.
create view vw_clientes_valor_geral as
select
  c.codigo,
  c.nome,
  c.fone as telefone,
  c.email,
  c.data_nascimento,
  count(distinct v.id) as qtd_compras,
  sum(vi.valor_total_liquido) as valor_total,
  max(v.data_emissao) as ultima_compra
from vendas v
join venda_itens vi on vi.venda_id = v.id
join clientes c on c.codigo = v.codigo_cliente
where v.codigo_cliente is not null
group by c.codigo, c.nome, c.fone, c.email, c.data_nascimento;

-- SEM security_invoker de propósito — ver comentário em schema.sql.
