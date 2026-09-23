-- Confirma (ou derruba) o achado "Encarte Setembro (campanha 6) não
-- aumentou a venda e deu prejuízo" (23/09/2026). Só leitura.
-- Testa as 5 explicações alternativas numa linha só:
--   1) desconto não chegou ao caixa     -> desconto_real_pct, pagou_acima_do_promocional
--   2) base inflada por outra campanha  -> produtos_em_outra_campanha_na_base
--   3) sazonalidade ago->set            -> variacao_mesmo_periodo_ano_anterior_pct
--   4) queda geral da loja              -> variacao_produtos_fora_de_campanha_pct
--   5) campanha em andamento            -> inicio, fim_considerado, dias_considerados
with itens as (
  select cp.codigo_produto, cp.preco_promocional, cp.percentual_desconto,
         coalesce(cp.data_inicio, c.data_inicio) as inicio,
         least(coalesce(cp.data_fim, c.data_fim), current_date - 1) as fim
  from campanhas c
  join campanha_produtos cp on cp.campanha_id = c.id
  where c.id = 6
),
datas as (
  select min(inicio) as ini, max(fim) as fim from itens
),
vd as (
  select vi.codigo_produto, v.data_emissao as dia,
         sum(vi.quantidade_produtos) as qtd,
         sum(vi.valor_total_liquido) as receita
  from venda_itens vi
  join vendas v on v.id = vi.venda_id
  where v.tipo_cancelamento is null
    and vi.quantidade_produtos > 0
    and v.data_emissao >= (select ini from datas) - 400
  group by 1, 2
),
por_item as (
  select
    i.codigo_produto, i.preco_promocional, i.percentual_desconto,
    coalesce(sum(vd.qtd) filter (where vd.dia between i.inicio and i.fim), 0) / greatest(i.fim - i.inicio + 1, 1) as q_dur,
    coalesce(sum(vd.qtd) filter (where vd.dia between i.inicio - 28 and i.inicio - 1), 0) / 28.0 as q_antes,
    sum(vd.receita) filter (where vd.dia between i.inicio and i.fim)
      / nullif(sum(vd.qtd) filter (where vd.dia between i.inicio and i.fim), 0) as p_dur,
    sum(vd.receita) filter (where vd.dia between i.inicio - 28 and i.inicio - 1)
      / nullif(sum(vd.qtd) filter (where vd.dia between i.inicio - 28 and i.inicio - 1), 0) as p_antes,
    -- mesmas janelas, 1 ano antes (52 semanas = mesmo dia da semana)
    coalesce(sum(vd.qtd) filter (where vd.dia between i.inicio - 364 and i.fim - 364), 0) / greatest(i.fim - i.inicio + 1, 1) as q_dur_ano_ant,
    coalesce(sum(vd.qtd) filter (where vd.dia between i.inicio - 392 and i.inicio - 365), 0) / 28.0 as q_antes_ano_ant
  from itens i
  left join vd on vd.codigo_produto = i.codigo_produto
  group by 1, 2, 3, i.inicio, i.fim
),
sobreposicao as (
  select count(distinct i.codigo_produto) as n
  from itens i
  join campanha_produtos cp2 on cp2.codigo_produto = i.codigo_produto and cp2.campanha_id <> 6
  join campanhas c2 on c2.id = cp2.campanha_id
  where coalesce(cp2.data_inicio, c2.data_inicio) <= i.inicio - 1
    and coalesce(cp2.data_fim, c2.data_fim) >= i.inicio - 28
),
controle as (
  -- produtos dos MESMOS grupos que nunca estiveram em campanha nenhuma
  select
    (sum(vd.qtd) filter (where vd.dia between d.ini and d.fim) / greatest(d.fim - d.ini + 1, 1))
      / nullif(sum(vd.qtd) filter (where vd.dia between d.ini - 28 and d.ini - 1) / 28.0, 0) - 1 as variacao
  from vd
  cross join datas d
  join produto_catalogo pc on pc.codigo = vd.codigo_produto
  where trim(pc.grupo) in (select distinct trim(pc2.grupo) from itens i join produto_catalogo pc2 on pc2.codigo = i.codigo_produto)
    and vd.codigo_produto not in (select codigo_produto from campanha_produtos)
  group by d.ini, d.fim
)
select
  (select ini from datas) as inicio,
  (select fim from datas) as fim_considerado,
  (select fim - ini + 1 from datas) as dias_considerados,
  count(*) as produtos,
  count(*) filter (where q_dur > 0) as produtos_vendidos_na_campanha,
  round(avg(percentual_desconto), 1) as desconto_prometido_pct,
  round(avg((1 - p_dur / p_antes) * 100) filter (where p_dur is not null and p_antes > 0), 1) as desconto_real_pct,
  count(*) filter (where p_dur > preco_promocional * 1.02) as pagou_acima_do_promocional,
  (select n from sobreposicao) as produtos_em_outra_campanha_na_base,
  round((sum(q_dur) / nullif(sum(q_antes), 0) - 1) * 100, 1) as variacao_venda_campanha_pct,
  round((sum(q_dur_ano_ant) / nullif(sum(q_antes_ano_ant), 0) - 1) * 100, 1) as variacao_mesmo_periodo_ano_anterior_pct,
  round(((select variacao from controle) * 100)::numeric, 1) as variacao_produtos_fora_de_campanha_pct,
  count(*) filter (where q_dur > q_antes) as produtos_subiram,
  count(*) filter (where q_dur < q_antes) as produtos_cairam
from por_item;
