-- ============================================================
-- Exemplo (03/08/2026) — cria uma campanha de Venda Adicional de teste
-- usando o produto MAIS VENDIDO nos últimos 30 dias (dado real, não
-- inventado), pra já aparecer com número >0 no card de Alertas e no
-- "Ver andamento" da aba do gestor assim que rodar.
--
-- Exclui taxa de entrega/frete/serviço do "mais vendido" — mesmo
-- filtro já usado em vw_clientes_produtos_vendedor (ver
-- migracao_uso_continuo_exclui_taxa.sql): categoria='SERVICOS' ou nome
-- contendo entrega/delivery/frete aparece em quase toda venda com
-- entrega, ganharia a contagem de "mais vendido" sem ser produto de
-- verdade.
--
-- data_inicio no passado (30 dias atrás) de propósito — pega as vendas
-- que já aconteceram desse produto, não só as futuras.
-- ============================================================

with produto_mais_vendido as (
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
  insert into campanhas_venda_adicional (nome, data_inicio, data_fim, tipo_premiacao, premiacao_ranking)
  select
    'Teste — ' || produto_mais_vendido.nome,
    current_date - 30,
    current_date + 14,
    'ranking',
    '[{"posicao":1,"valor":200},{"posicao":2,"valor":100},{"posicao":3,"valor":50}]'::jsonb
  from produto_mais_vendido
  returning id
)
insert into campanha_venda_adicional_produtos (campanha_id, codigo_produto)
select nova_campanha.id, produto_mais_vendido.codigo_produto
from nova_campanha, produto_mais_vendido;

-- ---------- VERIFICAÇÃO (opcional, só leitura) ----------
-- select * from campanhas_venda_adicional order by criada_em desc limit 5;
-- select * from vw_venda_adicional_vendas order by data_venda desc limit 20;

-- ---------- LIMPEZA (rode depois de conferir, se quiser tirar o teste) ----------
-- delete from campanhas_venda_adicional where nome ilike 'Teste — %';
