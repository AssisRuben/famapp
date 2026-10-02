-- ============================================================
-- Teste do card "Cliente de alto valor sumindo" — lista x controle
-- (consulta, não é migração; rodar no FIM do mês medido)
--
-- Coorte: clientes que estavam elegíveis no 1º dia do mês (mesma regra
-- do card desde 01/10/2026: top 25% em valor comprado, 60 a 180 dias sem
-- comprar, 2+ compras). Cada um cai em:
--   - "lista": apareceu no card pros vendedores;
--   - "controle": ficou de fora de propósito (fn_resgate_grupo_controle,
--     1 em cada 5, sorteio do mês).
-- Se a lista voltar a comprar MAIS que o controle, o contato funciona;
-- se ficar igual, não traz ninguém de volta.
--
-- Troque a data abaixo pelo 1º dia do mês medido.
-- ============================================================
with s as (
  select date '2026-10-01' as inicio,
         (date '2026-10-01' + interval '1 month - 1 day')::date as fim
),
gasto as (
  select v.codigo_cliente,
         sum(vi.valor_total_liquido) as valor_total,
         max(v.data_emissao) as ultima_compra,
         count(distinct v.id) as qtd_compras
  from vendas v
  join venda_itens vi on vi.venda_id = v.id
  cross join s
  where v.codigo_cliente is not null
    and v.tipo_cancelamento is null
    and v.data_emissao < s.inicio
  group by 1
),
corte as (
  select percentile_cont(0.75) within group (order by valor_total) as p75
  from gasto where valor_total > 0
),
coorte as (
  select g.codigo_cliente,
         case when fn_resgate_grupo_controle(g.codigo_cliente,
                     extract(year from s.inicio)::int, extract(month from s.inicio)::int)
              then 'controle' else 'lista' end as grupo
  from gasto g, corte c, s
  where g.valor_total >= c.p75
    and s.inicio - g.ultima_compra between 60 and 180
    and g.qtd_compras >= 2
),
resultado as (
  select co.grupo, co.codigo_cliente,
         exists (
           select 1 from contatos_clientes cc, s
           where cc.codigo_cliente = co.codigo_cliente
             and cc.motivo = 'alto_valor_sumindo'
             and cc.tipo_contato in ('whatsapp', 'ligacao')
             and (cc.contatado_em at time zone 'America/Sao_Paulo')::date between s.inicio and s.fim
         ) as contatado,
         (select sum(vi.valor_total_liquido - vi.valor_total_custo)
            from vendas v
            join venda_itens vi on vi.venda_id = v.id, s
           where v.codigo_cliente = co.codigo_cliente
             and v.tipo_cancelamento is null
             and v.data_emissao between s.inicio and s.fim) as margem_no_mes
  from coorte co
)
select
  grupo,
  count(*)                                                        as clientes,
  count(*) filter (where contatado)                               as contatados,
  count(*) filter (where margem_no_mes is not null)               as voltaram,
  round(100.0 * count(*) filter (where margem_no_mes is not null) / count(*), 1) as pct_voltou,
  round(coalesce(sum(margem_no_mes), 0), 2)                       as margem_no_mes,
  round(coalesce(sum(margem_no_mes), 0) / count(*), 2)            as margem_por_cliente
from resultado
group by grupo
order by grupo desc;
