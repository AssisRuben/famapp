-- ============================================================
-- Migração pra rodar no projeto Supabase REAL (23/08/2026) — função
-- calcular_metricas_mes(mes_ref, data_fim), que centraliza TODO o
-- cálculo das métricas mensais num único lugar (antes só existia
-- inline no workflow n8n de fechamento). Três usos:
--
-- 1. Fechamento do mês (n8n, dia 1) — chama a função pro mês que
--    ACABOU (data_fim omitido = mês inteiro) e grava (INSERT/UPSERT)
--    o resultado em metricas_mensais, congelando o mês.
-- 2. Prévia do mês em andamento (app, aba Relatório mensal) — chama a
--    função pro mês ATUAL direto via RPC (data_fim omitido = até
--    hoje, que é o limite natural já que não existe venda no futuro),
--    sem gravar nada — números "ao vivo".
-- 3. Comparação "mesmo período" (app) — quando o mês ATUAL está em
--    andamento (ex.: só 23 dias corridos), comparar contra o mês
--    ANTERIOR inteiro é injusto. A tela então chama a função pro mês
--    anterior passando data_fim = mesmo dia do mês.
--
-- produtos_em_falta_reportados fica de fora do recálculo: é o único
-- contador que já vive em metricas_mensais em tempo real (trigger no
-- insert de produtos_em_falta) — a função REPASSA o que já está
-- gravado, só quando o pedido é o mês inteiro (não dá pra saber
-- quantos tinham sido reportados até um dia específico do mês
-- passado).
--
-- ---------- margem_bruta_total_deduplicada (23/08/2026) ----------
-- Achado com dado real: um produto pode estar cadastrado em MAIS DE
-- UMA categoria ao mesmo tempo (ex.: numa campanha de Venda Adicional
-- E também numa campanha de Cartazetes, essa segunda só pra habilitar
-- o card de contato dos vendedores — uso legítimo, não é erro do
-- usuário). Se cada categoria soma seu próprio total e depois a tela
-- SOMA as 5 categorias pra ter uma margem "total", a mesma venda entra
-- na conta duas vezes. Cada total de categoria continua correto
-- ISOLADAMENTE — o problema é só a soma final.
--
-- Por isso a função entrega TAMBÉM uma chave própria
-- 'margem_bruta_total_deduplicada', calculada em cima do CONJUNTO de
-- venda_itens distintos que caem em QUALQUER uma das 4 categorias
-- baseadas em item (venda_adicional/venda_complementar/venda_campanha/
-- produto_promocao) — cada item conta uma vez só, não importa em
-- quantas categorias se encaixe. A margem de cliente_alto_valor_recuperado
-- (que é por VENDA inteira, unidade diferente das outras 4) é somada
-- por cima sem dedup cruzado — overlap residual entre ela e as outras
-- 4 (ex.: cliente recuperado que também levou um produto de venda
-- adicional na mesma compra) não é tratado, é mais raro e mudaria bem
-- menos o total do que o caso resolvido aqui. A TELA deve usar essa
-- chave pra "margem total"/destaque do mês, não somar as 5 categorias
-- na mão.
--
-- SECURITY DEFINER + checagem de gestor dentro da função (mesmo motivo
-- de vw_carteira_clientes/vw_produtos_promocao_clientes rodarem sem
-- security_invoker): a função olha carteira_clientes, contatos_clientes
-- e pendencias de TODOS os vendedores, não só o do usuário logado — a
-- RLS dessas tabelas não deixaria isso rodando como invoker.
--
-- Checagem só entra em vigor quando tem sessão autenticada de verdade
-- (auth.uid() não nulo, ou seja, chamada via app/RPC) — bloqueia
-- vendedor comum, deixa passar gestor. Conexão direta (n8n, migração,
-- psql) não tem contexto de auth nenhum, e já é privilegiada por
-- natureza — exigir gestor ali quebraria o fechamento sem adicionar
-- segurança de verdade.
--
-- IMPORTANTE: `returns table (codigo_vendedor, chave, valor)` faz o
-- PL/pgSQL criar variáveis internas com esses 3 nomes exatos — QUALQUER
-- apelido de coluna dentro da query com o mesmo nome ("as valor",
-- "as chave") dá erro "column reference is ambiguous", mesmo
-- qualificado. Por isso os apelidos internos usam nomes diferentes
-- (receita/rotulo/montante) e só viram codigo_vendedor/chave/valor na
-- saída final, por posição.
drop function if exists calcular_metricas_mes(date);

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
      and v.data_emissao >= mes_ref and v.data_emissao < fim_exclusivo
  ),
  ia_venda_complementar as (
    select distinct vic.venda_item_id
    from venda_item_complementar vic
    join venda_itens vi on vi.id = vic.venda_item_id
    join vendas v on v.id = vi.venda_id
    where v.data_emissao >= mes_ref and v.data_emissao < fim_exclusivo
  ),
  ia_venda_campanha as (
    select distinct vi.id as venda_item_id
    from campanha_produtos cp
    join campanhas c on c.id = cp.campanha_id
    join venda_itens vi on vi.codigo_produto = cp.codigo_produto
    join vendas v on v.id = vi.venda_id
      and v.data_emissao between coalesce(cp.data_inicio, c.data_inicio) and coalesce(cp.data_fim, c.data_fim)
    where v.codigo_vendedor is not null
      and v.data_emissao >= mes_ref and v.data_emissao < fim_exclusivo
  ),
  ia_produto_promocao as (
    select distinct vi.id as venda_item_id
    from produtos p
    join venda_itens vi on vi.codigo_produto = p.codigo
    join vendas v on v.id = vi.venda_id
    where p.em_promocao = true
      and v.codigo_vendedor is not null
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
    where v.data_emissao >= mes_ref and v.data_emissao < fim_exclusivo
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

-- App chama via supabase.rpc('calcular_metricas_mes', { mes_ref, data_fim })
-- — precisa de EXECUTE explícito pro role authenticated (a checagem de
-- gestor de verdade acontece DENTRO da função, isso aqui só libera a
-- chamada em si).
grant execute on function calcular_metricas_mes(date, date) to authenticated;

-- ---------- VERIFICAÇÃO (opcional, só leitura — precisa estar logado como gestor) ----------
-- select * from calcular_metricas_mes(date_trunc('month', current_date)::date);
-- select * from calcular_metricas_mes('2026-07-01'::date, '2026-07-23'::date);
