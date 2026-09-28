-- ============================================================
-- Proposta do motor fora de tudo que é "campanha valendo" (24/09/2026)
--
-- migracao_motor_campanhas.sql criou campanhas.status ('proposta' /
-- 'aprovada' / 'rejeitada') e campanha_produtos.braco ('desconto' /
-- 'incentivo' / 'controle'), mas as views/funções que tratam campanha
-- como ativa continuaram olhando TODAS as campanhas. Efeito a partir do
-- início da proposta (15/10): produto de proposta NÃO aprovada — e os
-- itens do grupo de CONTROLE, que por definição ficam a preço normal e
-- invisíveis pro vendedor — apareceriam nos alertas de promoção pros
-- vendedores e contariam nas métricas de venda de campanha.
--
-- Regra única aplicada nos 3 lugares: só conta campanha 'aprovada' e
-- item com braco <> 'controle'.
--
-- Rodar DEPOIS de migracao_motor_campanhas.sql. Idempotente.
-- ============================================================

-- 1) Alertas de promoção pros vendedores ----------------------
-- Base: migracao_promocao_periodo.sql (versão mais recente da view).
-- Única mudança: filtro de status/braço no ramo de campanha_produtos.
create or replace view vw_produtos_promocao_clientes as
with produtos_em_promocao as (
  select
    p.codigo as codigo_produto,
    p.nome as nome_produto,
    p.preco_atual,
    p.preco_anterior,
    p.percentual_desconto,
    p.exige_receita,
    p.tipo_receita,
    p.updated_at::date as periodo_inicio
  from produtos p
  where p.em_promocao = true

  union all

  select
    cp.codigo_produto,
    pc.nome as nome_produto,
    cp.preco_promocional as preco_atual,
    case
      when cp.percentual_desconto > 0 then round(cp.preco_promocional / (1 - cp.percentual_desconto / 100), 2)
      else cp.preco_promocional
    end::numeric(12,2) as preco_anterior,
    cp.percentual_desconto,
    (nullif(trim(pc.tipo_lista), '') is not null) as exige_receita,
    case
      when trim(pc.tipo_lista) = 'T' then 'antimicrobiano'
      when nullif(trim(pc.tipo_lista), '') is not null then 'controle_especial'
      else null
    end as tipo_receita,
    coalesce(cp.data_inicio, camp.data_inicio) as periodo_inicio
  from campanha_produtos cp
  join campanhas camp on camp.id = cp.campanha_id
  join produto_catalogo pc on pc.codigo = cp.codigo_produto
  where current_date between camp.data_inicio and camp.data_fim
    and camp.status = 'aprovada'
    and cp.braco <> 'controle'
),
vendido_no_periodo as (
  select pp.codigo_produto, sum(vi.quantidade_produtos) as quantidade_vendida_periodo
  from produtos_em_promocao pp
  join venda_itens vi on vi.codigo_produto = pp.codigo_produto
  join vendas v on v.id = vi.venda_id
    and v.data_emissao >= pp.periodo_inicio
    and v.tipo_cancelamento is null
  group by pp.codigo_produto
)
select
  pp.codigo_produto,
  pp.nome_produto,
  pp.preco_atual,
  pp.preco_anterior,
  pp.percentual_desconto,
  c.codigo as codigo_cliente,
  c.nome as nome_cliente,
  coalesce(c.celular, c.fone) as telefone_cliente,
  max(v.data_emissao) as ultima_compra_produto,
  sum(vi.quantidade_produtos) as quantidade_total,
  pp.exige_receita,
  pp.tipo_receita,
  coalesce(vp.quantidade_vendida_periodo, 0) as quantidade_vendida_periodo
from produtos_em_promocao pp
join venda_itens vi on vi.codigo_produto = pp.codigo_produto
join vendas v on v.id = vi.venda_id and v.tipo_cancelamento is null
join clientes c on c.codigo = v.codigo_cliente
left join vendido_no_periodo vp on vp.codigo_produto = pp.codigo_produto
group by pp.codigo_produto, pp.nome_produto, pp.preco_atual, pp.preco_anterior, pp.percentual_desconto,
  c.codigo, c.nome, c.fone, c.celular, pp.exige_receita, pp.tipo_receita, vp.quantidade_vendida_periodo;

-- 2) Desempenho na lista de campanhas --------------------------
-- Base: migracao_campanhas_desempenho.sql. Controle fica de fora (não é
-- venda "da campanha"); proposta ainda não aprovada aparece com zero.
create or replace view vw_campanhas_desempenho as
select
  cp.campanha_id,
  sum(vi.quantidade_produtos) as quantidade_vendida,
  sum(vi.valor_total_liquido) as valor_vendido
from campanha_produtos cp
join campanhas c on c.id = cp.campanha_id
join venda_itens vi on vi.codigo_produto = cp.codigo_produto
join vendas v on v.id = vi.venda_id
  and v.data_emissao between coalesce(cp.data_inicio, c.data_inicio) and coalesce(cp.data_fim, c.data_fim)
where v.codigo_vendedor is not null
  and v.tipo_cancelamento is null
  and c.status = 'aprovada'
  and cp.braco <> 'controle'
group by cp.campanha_id;

alter view vw_campanhas_desempenho set (security_invoker = true);

-- 3) Métricas do mês (venda de campanha por vendedor) ----------
-- Base: migracao_metricas_mensais_calculo_ao_vivo.sql, copiada inteira;
-- única mudança no CTE ia_venda_campanha (marcada abaixo).
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
      sum(vi.quantidade_produtos) as qtd,
      sum(vi.valor_total_liquido) as receita,
      sum(vi.valor_total_liquido - vi.valor_total_custo) as margem
    from vendas v
    join venda_itens vi on vi.venda_id = v.id
    where v.codigo_cliente is not null and v.codigo_vendedor is not null
      and v.tipo_cancelamento is null
    group by v.id, v.codigo_cliente, v.codigo_vendedor, v.data_emissao
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

  select t.codigo_vendedor, 'margem_bruta_total_deduplicada'::text, t.margem
  from agr_margem_total t
  where t.codigo_vendedor is not null;
end;
$$;

grant execute on function calcular_metricas_mes(date, date) to authenticated;
