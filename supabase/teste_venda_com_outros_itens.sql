-- ============================================================
-- Apaga a campanha de teste do Glifage e cria uma nova pro critério
-- 'venda_com_outros_itens' (03/08/2026) — só conta a venda se o
-- produto da campanha veio JUNTO com outro item na mesma nota, não
-- sozinho.
-- ============================================================

delete from campanhas_venda_adicional where nome ilike 'Teste — GLIFAGE%';

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
  insert into campanhas_venda_adicional (nome, data_inicio, data_fim, tipo_premiacao, criterio_quantidade, premiacao_ranking)
  select
    'Teste (com outro item) — ' || produto_teste.nome,
    current_date - 30,
    current_date + 14,
    'ranking',
    'venda_com_outros_itens',
    '[{"posicao":1,"valor":200},{"posicao":2,"valor":100},{"posicao":3,"valor":50}]'::jsonb
  from produto_teste
  returning id
)
insert into campanha_venda_adicional_produtos (campanha_id, codigo_produto)
select nova_campanha.id, produto_teste.codigo_produto
from nova_campanha, produto_teste;

-- ---------- VERIFICAÇÃO (opcional, só leitura) ----------
-- Mostra quantas vendas do produto escolhido vieram sozinhas (não
-- contam) vs. acompanhadas de outro item (contam) — pra confirmar o
-- filtro na prática, antes mesmo de abrir o app:
-- select
--   count(*) as total_linhas,
--   count(*) filter (where qtd_itens_na_venda > 1) as com_outro_item_conta,
--   count(*) filter (where qtd_itens_na_venda = 1) as sozinha_nao_conta
-- from vw_venda_adicional_vendas
-- where campanha_id = (select id from campanhas_venda_adicional order by criada_em desc limit 1);
