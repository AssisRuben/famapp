-- ============================================================
-- Apaga a campanha de teste anterior (que pegou Bepantol sem venda) e
-- cria de novo com HIPOGLÓS CR PROT ORIG 40G (código 22043, 13 vendas
-- confirmadas nos últimos 90 dias) + outro item qualquer, critério
-- padrão (acumulado_periodo), ranking 1º/2º/3º.
-- ============================================================

delete from campanhas_venda_adicional where nome ilike 'Teste (ranking, vários produtos)%';

with outro_item as (
  select vi.codigo_produto as codigo, pc.nome
  from venda_itens vi
  join vendas v on v.id = vi.venda_id
  left join produto_catalogo pc on pc.codigo = vi.codigo_produto
  where v.data_emissao >= current_date - 30
    and coalesce(pc.categoria, '') <> 'SERVICOS'
    and coalesce(pc.nome, '') !~* 'entrega|delivery|frete'
    and vi.codigo_produto <> 22043
  group by vi.codigo_produto, pc.nome
  order by count(*) desc
  limit 1
),
nova_campanha as (
  insert into campanhas_venda_adicional (nome, data_inicio, data_fim, tipo_premiacao, criterio_quantidade, premiacao_ranking)
  select
    'Teste (ranking, vários produtos) — HIPOGLÓS + ' || outro_item.nome,
    current_date - 30,
    current_date + 14,
    'ranking',
    'acumulado_periodo',
    '[{"posicao":1,"valor":200},{"posicao":2,"valor":100},{"posicao":3,"valor":50}]'::jsonb
  from outro_item
  returning id
)
insert into campanha_venda_adicional_produtos (campanha_id, codigo_produto)
select nova_campanha.id, 22043 from nova_campanha
union all
select nova_campanha.id, outro_item.codigo from nova_campanha, outro_item;

-- ---------- VERIFICAÇÃO (opcional, só leitura) ----------
-- select codigo_produto, nome_produto, count(*), sum(quantidade)
-- from vw_venda_adicional_vendas
-- where campanha_id = (select id from campanhas_venda_adicional order by criada_em desc limit 1)
-- group by codigo_produto, nome_produto;
