-- ============================================================
-- Relatório mensal: clientes RESGATADOS pelo contato (01/10/2026)
--
-- calcular_metricas_mes ganha (resto idêntico à versão de
-- migracao_campanha_status_app.sql):
--   - cliente_resgatado_contato_{quantidade,valor,margem} por vendedor:
--     cliente contatado pelo card "Cliente de alto valor sumindo" que
--     comprou até 30 dias depois, creditado a quem FEZ o contato. Valor
--     e margem = SÓ a primeira compra depois do contato (as seguintes
--     são o ciclo normal do cliente);
--   - resgate_teste_lista_pct / resgate_teste_controle_pct (farmácia):
--     % que voltou a comprar no mês, lista do card x grupo de controle
--     (a partir de outubro/2026).
-- cliente_alto_valor_recuperado continua igual (qualquer volta depois de
-- 60 dias, de quem atendeu) — a medição de setembro mostrou que é quase
-- tudo volta natural, por isso o rótulo na tela mudou.
--
-- O fechamento do dia 1 (fechamento_relatorio_mensal.n8n.json) grava
-- tudo que a função devolve — chave nova entra sozinha. No fim, grava as
-- chaves novas de SETEMBRO (mês já fechado sem elas).
--
-- Rodar DEPOIS de migracao_resgate_alto_valor.sql (usa
-- fn_resgate_grupo_controle). Idempotente.
-- ============================================================

create or replace function calcular_metricas_mes(mes_ref date, data_fim date default null)
returns table (codigo_vendedor integer, chave text, valor numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  fim_natural date := (mes_ref + interval '1 month' - interval '1 day')::date;
  fim date := coalesce(data_fim, (mes_ref + interval '1 month' - interval '1 day')::date);
  fim_exclusivo date := fim + interval '1 day';
begin
  if auth.uid() is not null and not exists (
    select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
  ) then
    raise exception 'Só gestor pode consultar métricas mensais.';
  end if;

  return query

  with

  -- ---------- IDs de venda_itens rastreados por categoria (pra dedup) ----------
  ia_venda_adicional as (
    select distinct vi.id as venda_item_id
    from campanha_venda_adicional_produtos cvap
    join campanhas_venda_adicional camp on camp.id = cvap.campanha_id
    join venda_itens vi on vi.codigo_produto = cvap.codigo_produto
    join vendas v on v.id = vi.venda_id and v.data_emissao between camp.data_inicio and camp.data_fim
    where v.codigo_vendedor is not null
      and v.tipo_cancelamento is null
      and v.data_emissao >= mes_ref and v.data_emissao < fim_exclusivo
  ),
  ia_venda_complementar as (
    select distinct vic.venda_item_id
    from venda_item_complementar vic
    join venda_itens vi on vi.id = vic.venda_item_id
    join vendas v on v.id = vi.venda_id
    where v.tipo_cancelamento is null
      and v.data_emissao >= mes_ref and v.data_emissao < fim_exclusivo
  ),
  ia_venda_campanha as (
    select distinct vi.id as venda_item_id
    from campanha_produtos cp
    join campanhas c on c.id = cp.campanha_id
      and c.status = 'aprovada' and cp.braco <> 'controle'  -- 24/09/2026: proposta e controle não contam
    join venda_itens vi on vi.codigo_produto = cp.codigo_produto
    join vendas v on v.id = vi.venda_id
      and v.data_emissao between coalesce(cp.data_inicio, c.data_inicio) and coalesce(cp.data_fim, c.data_fim)
    where v.codigo_vendedor is not null
      and v.tipo_cancelamento is null
      and v.data_emissao >= mes_ref and v.data_emissao < fim_exclusivo
  ),
  ia_produto_promocao as (
    select distinct vi.id as venda_item_id
    from produtos p
    join venda_itens vi on vi.codigo_produto = p.codigo
    join vendas v on v.id = vi.venda_id
    where p.em_promocao = true
      and v.codigo_vendedor is not null
      and v.tipo_cancelamento is null
      and v.data_emissao >= mes_ref and v.data_emissao < fim_exclusivo
  ),

  -- ---------- Agregados por categoria (reaproveita os IDs acima) ----------
  agr_venda_adicional as (
    select
      v.codigo_vendedor,
      sum(vi.quantidade_produtos) as qtd,
      sum(vi.valor_total_liquido) as receita,
      sum(vi.valor_total_liquido - vi.valor_total_custo) as margem
    from ia_venda_adicional ia
    join venda_itens vi on vi.id = ia.venda_item_id
    join vendas v on v.id = vi.venda_id
    group by v.codigo_vendedor
  ),
  agr_venda_complementar as (
    select
      v.codigo_vendedor,
      sum(vi.quantidade_produtos) as qtd,
      sum(vi.valor_total_liquido) as receita,
      sum(vi.valor_total_liquido - vi.valor_total_custo) as margem
    from ia_venda_complementar ia
    join venda_itens vi on vi.id = ia.venda_item_id
    join vendas v on v.id = vi.venda_id
    group by v.codigo_vendedor
  ),
  agr_venda_campanha as (
    select
      v.codigo_vendedor,
      sum(vi.quantidade_produtos) as qtd,
      sum(vi.valor_total_liquido) as receita,
      sum(vi.valor_total_liquido - vi.valor_total_custo) as margem
    from ia_venda_campanha ia
    join venda_itens vi on vi.id = ia.venda_item_id
    join vendas v on v.id = vi.venda_id
    group by v.codigo_vendedor
  ),
  agr_produto_promocao as (
    select
      v.codigo_vendedor,
      sum(vi.quantidade_produtos) as qtd,
      sum(vi.valor_total_liquido) as receita,
      sum(vi.valor_total_liquido - vi.valor_total_custo) as margem
    from ia_produto_promocao ia
    join venda_itens vi on vi.id = ia.venda_item_id
    join vendas v on v.id = vi.venda_id
    group by v.codigo_vendedor
  ),

  -- ---------- Cliente de alto valor que voltou a comprar ----------
  -- Top 25% de valor histórico + 60+ dias sem comprar antes dessa
  -- compra (mesmo critério do card "Cliente de alto valor sumindo" em
  -- Alertas). "quantidade" = Nº DE CLIENTES recuperados, não itens —
  -- unidade diferente das outras 4 categorias (por isso fica fora do
  -- dedup por venda_item_id acima).
  venda_agregada as (
    select
      v.id as venda_id,
      v.codigo_cliente,
      v.codigo_vendedor,
      v.data_emissao,
      v.hora_emissao,
      sum(vi.quantidade_produtos) as qtd,
      sum(vi.valor_total_liquido) as receita,
      sum(vi.valor_total_liquido - vi.valor_total_custo) as margem
    from vendas v
    join venda_itens vi on vi.venda_id = v.id
    where v.codigo_cliente is not null and v.codigo_vendedor is not null
      and v.tipo_cancelamento is null
    group by v.id, v.codigo_cliente, v.codigo_vendedor, v.data_emissao, v.hora_emissao
  ),
  receita_por_cliente as (
    select codigo_cliente, sum(receita) as receita_total
    from venda_agregada
    group by codigo_cliente
  ),
  corte as (
    select percentile_cont(0.75) within group (order by receita_total) as p75
    from receita_por_cliente
    where receita_total > 0
  ),
  com_gap as (
    select
      va.*,
      lag(va.data_emissao) over (partition by va.codigo_cliente order by va.data_emissao, va.venda_id) as data_anterior
    from venda_agregada va
  ),
  agr_cliente_recuperado as (
    select
      cg.codigo_vendedor,
      count(distinct cg.codigo_cliente) as qtd,
      sum(cg.receita) as receita,
      sum(cg.margem) as margem
    from com_gap cg
    join receita_por_cliente rc on rc.codigo_cliente = cg.codigo_cliente
    cross join corte c
    where rc.receita_total >= c.p75
      and cg.data_anterior is not null
      and (cg.data_emissao - cg.data_anterior) >= 60
      and cg.data_emissao >= mes_ref
      and cg.data_emissao < fim_exclusivo
    group by cg.codigo_vendedor
  ),

  -- ---------- Resgate PELO CONTATO (01/10/2026) ----------
  -- Diferente de cliente_alto_valor_recuperado (qualquer volta depois de
  -- 60 dias, creditada a quem ATENDEU): aqui só conta a compra feita até
  -- 30 dias depois de um contato registrado no card "Cliente de alto
  -- valor sumindo" (WhatsApp/ligação), creditada a quem FEZ O CONTATO —
  -- mesmo que outro vendedor tenha atendido. Contato mais recente antes
  -- da compra leva o crédito. Fica FORA da margem total deduplicada
  -- (a venda já conta pra quem atendeu).
  --
  -- Só a PRIMEIRA compra depois do contato é o resgate (decisão do
  -- gestor): as seguintes são o ciclo normal do cliente e não contam.
  -- Olha 31 dias pra trás do mês pra saber se a primeira compra caiu no
  -- mês anterior (contato 20/09, compra 25/09 e 05/10 -> 05/10 não conta
  -- em outubro).
  compra_apos_contato as (
    select
      va.codigo_cliente,
      va.data_emissao,
      va.receita,
      va.margem,
      ct.codigo_vendedor as vendedor_contato,
      row_number() over (
        partition by ct.contato_id
        order by va.data_emissao, va.hora_emissao nulls last, va.venda_id
      ) as ordem
    from venda_agregada va
    join lateral (
      select cc.id as contato_id, cc.codigo_vendedor
      from contatos_clientes cc
      where cc.codigo_cliente = va.codigo_cliente
        and cc.motivo = 'alto_valor_sumindo'
        and cc.tipo_contato in ('whatsapp', 'ligacao')
        and cc.codigo_vendedor is not null
        and (cc.contatado_em at time zone 'America/Sao_Paulo')
            <= va.data_emissao + coalesce(va.hora_emissao, time '23:59')
        and (cc.contatado_em at time zone 'America/Sao_Paulo')::date >= va.data_emissao - 30
      order by cc.contatado_em desc
      limit 1
    ) ct on true
    where va.data_emissao >= mes_ref - 31 and va.data_emissao < fim_exclusivo
  ),
  agr_resgate_contato as (
    select
      vendedor_contato as codigo_vendedor,
      count(distinct codigo_cliente) as qtd,
      sum(receita) as receita,
      sum(margem) as margem
    from compra_apos_contato
    where ordem = 1
      and data_emissao >= mes_ref
    group by vendedor_contato
  ),

  -- ---------- Teste do card: lista x grupo de controle (01/10/2026) ----------
  -- Coorte = elegíveis no 1º dia do mês (top 25% em valor, 60 a 180 dias
  -- sem comprar, 2+ compras — regra do card desde 01/10/2026); 1 em 5 fica
  -- fora da lista (fn_resgate_grupo_controle). % de cada grupo que comprou
  -- no mês. Só a partir de outubro/2026 (antes não tinha controle).
  hist_antes as (
    select codigo_cliente,
           sum(receita) as valor_total,
           max(data_emissao) as ultima,
           count(*) as qtd_compras
    from venda_agregada
    where data_emissao < mes_ref
    group by codigo_cliente
  ),
  corte_antes as (
    select percentile_cont(0.75) within group (order by valor_total) as p75
    from hist_antes where valor_total > 0
  ),
  teste_resgate as (
    select
      fn_resgate_grupo_controle(h.codigo_cliente,
        extract(year from mes_ref)::int, extract(month from mes_ref)::int) as controle,
      exists (
        select 1 from venda_agregada va
        where va.codigo_cliente = h.codigo_cliente
          and va.data_emissao >= mes_ref and va.data_emissao < fim_exclusivo
      ) as voltou
    from hist_antes h
    cross join corte_antes c
    where mes_ref >= date '2026-10-01'
      and h.valor_total >= c.p75
      and mes_ref - h.ultima between 60 and 180
      and h.qtd_compras >= 2
  ),

  -- ---------- Vendas pra clientes da carteira ----------
  -- Atribuída ao DONO da carteira, não a quem bateu a venda — mesmo
  -- critério de vw_carteira_clientes (valor_6_meses/comprado_este_mes):
  -- mede o engajamento do CLIENTE, não quem processou a venda.
  -- Categoria à parte, de propósito NÃO entra em ia_todos/margem
  -- total deduplicada abaixo — é praticamente todo o consumo normal
  -- do cliente (não uma ação pontual como as outras 4), incluir ali
  -- infla o total sem representar resultado incremental de alguma
  -- iniciativa.
  --
  -- "quantidade" = Nº DE VENDAS (atendimentos) distintas, não soma de
  -- quantidade_produtos — achado com dado real (23/08/2026): essa
  -- categoria varre TODA compra de TODO cliente da carteira no mês
  -- (sem recorte de campanha como as outras 4), então somar unidades
  -- de produto inflava o número bem além da quantidade real de vendas
  -- (ex.: 90 "vendas" que eram na real ~20 atendimentos com vários
  -- itens cada). receita/margem continuam somando TODOS os itens da
  -- venda, só a contagem mudou.
  agr_venda_carteira as (
    select
      cc.codigo_vendedor,
      count(distinct v.id) as qtd,
      sum(vi.valor_total_liquido) as receita,
      sum(vi.valor_total_liquido - vi.valor_total_custo) as margem
    from carteira_clientes cc
    join vendas v on v.codigo_cliente = cc.codigo_cliente
    join venda_itens vi on vi.venda_id = v.id
    where v.tipo_cancelamento is null
      and v.data_emissao >= mes_ref and v.data_emissao < fim_exclusivo
    group by cc.codigo_vendedor
  ),

  -- ---------- Margem total DEDUPLICADA (dia 1 uma vez só, mesmo em 2+ categorias) ----------
  ia_todos as (
    select venda_item_id from ia_venda_adicional
    union
    select venda_item_id from ia_venda_complementar
    union
    select venda_item_id from ia_venda_campanha
    union
    select venda_item_id from ia_produto_promocao
  ),
  agr_itens_dedup as (
    select v.codigo_vendedor, sum(vi.valor_total_liquido - vi.valor_total_custo) as margem
    from ia_todos ia
    join venda_itens vi on vi.id = ia.venda_item_id
    join vendas v on v.id = vi.venda_id
    where v.codigo_vendedor is not null
    group by v.codigo_vendedor
  ),
  agr_margem_total as (
    select
      coalesce(d.codigo_vendedor, r.codigo_vendedor) as codigo_vendedor,
      coalesce(d.margem, 0) + coalesce(r.margem, 0) as margem
    from agr_itens_dedup d
    full outer join agr_cliente_recuperado r on r.codigo_vendedor = d.codigo_vendedor
  )

  -- ---------- Saída final ----------
  select m.codigo_vendedor, m.chave, m.valor
  from metricas_mensais m
  where m.mes_referencia = mes_ref
    and m.chave = 'produtos_em_falta_reportados'
    and fim = fim_natural

  union all

  select cc.codigo_vendedor, 'carteira_clientes_total'::text, count(*)::numeric
  from carteira_clientes cc
  group by cc.codigo_vendedor

  union all

  select
    cc.codigo_vendedor,
    case cc.tipo_contato when 'whatsapp' then 'whatsapp_enviados' else 'ligacoes_feitas' end,
    count(*)::numeric
  from contatos_clientes cc
  where cc.tipo_contato in ('whatsapp', 'ligacao')
    and cc.codigo_vendedor is not null
    and cc.contatado_em >= mes_ref
    and cc.contatado_em < fim_exclusivo
  group by cc.codigo_vendedor, cc.tipo_contato

  union all

  select null::integer, 'pendencias_dadas_baixa'::text, count(*)::numeric
  from pendencias p
  where p.baixada = true
    and p.baixada_em >= mes_ref
    and p.baixada_em < fim_exclusivo

  union all

  select b.codigo_vendedor, x.rotulo, x.montante
  from agr_venda_adicional b
  cross join lateral (values
    ('venda_adicional_quantidade', b.qtd),
    ('venda_adicional_valor', b.receita),
    ('venda_adicional_margem', b.margem)
  ) as x(rotulo, montante)

  union all

  select b.codigo_vendedor, x.rotulo, x.montante
  from agr_venda_complementar b
  cross join lateral (values
    ('venda_complementar_quantidade', b.qtd),
    ('venda_complementar_valor', b.receita),
    ('venda_complementar_margem', b.margem)
  ) as x(rotulo, montante)

  union all

  select b.codigo_vendedor, x.rotulo, x.montante
  from agr_venda_campanha b
  cross join lateral (values
    ('venda_campanha_quantidade', b.qtd),
    ('venda_campanha_valor', b.receita),
    ('venda_campanha_margem', b.margem)
  ) as x(rotulo, montante)

  union all

  -- em_promocao é a flag ATUAL, não histórica (mesma limitação do
  -- resto do app com esse campo).
  select b.codigo_vendedor, x.rotulo, x.montante
  from agr_produto_promocao b
  cross join lateral (values
    ('produto_promocao_quantidade', b.qtd),
    ('produto_promocao_valor', b.receita),
    ('produto_promocao_margem', b.margem)
  ) as x(rotulo, montante)

  union all

  select b.codigo_vendedor, x.rotulo, x.montante
  from agr_cliente_recuperado b
  cross join lateral (values
    ('cliente_alto_valor_recuperado_quantidade', b.qtd),
    ('cliente_alto_valor_recuperado_valor', b.receita),
    ('cliente_alto_valor_recuperado_margem', b.margem)
  ) as x(rotulo, montante)

  union all

  select b.codigo_vendedor, x.rotulo, x.montante
  from agr_venda_carteira b
  cross join lateral (values
    ('venda_carteira_quantidade', b.qtd),
    ('venda_carteira_valor', b.receita),
    ('venda_carteira_margem', b.margem)
  ) as x(rotulo, montante)

  union all

  select b.codigo_vendedor, x.rotulo, x.montante
  from agr_resgate_contato b
  cross join lateral (values
    ('cliente_resgatado_contato_quantidade', b.qtd),
    ('cliente_resgatado_contato_valor', b.receita),
    ('cliente_resgatado_contato_margem', b.margem)
  ) as x(rotulo, montante)

  union all

  select null::integer, x.rotulo, x.montante
  from (
    select
      round(100.0 * count(*) filter (where not controle and voltou)
            / nullif(count(*) filter (where not controle), 0), 1) as pct_lista,
      round(100.0 * count(*) filter (where controle and voltou)
            / nullif(count(*) filter (where controle), 0), 1) as pct_controle
    from teste_resgate
  ) t
  cross join lateral (values
    ('resgate_teste_lista_pct', t.pct_lista),
    ('resgate_teste_controle_pct', t.pct_controle)
  ) as x(rotulo, montante)
  where x.montante is not null

  union all

  select t.codigo_vendedor, 'margem_bruta_total_deduplicada'::text, t.margem
  from agr_margem_total t
  where t.codigo_vendedor is not null;
end;
$$;

grant execute on function calcular_metricas_mes(date, date) to authenticated;

-- Setembro já fechou sem as chaves novas: grava só elas.
insert into metricas_mensais (mes_referencia, codigo_vendedor, chave, valor)
select date '2026-09-01', codigo_vendedor, chave, valor
from calcular_metricas_mes(date '2026-09-01')
where chave like 'cliente_resgatado_contato_%'
on conflict (mes_referencia, chave, coalesce(codigo_vendedor, -1))
do update set valor = excluded.valor, atualizado_em = now();
