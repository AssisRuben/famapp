-- ============================================================
-- Devolução que cruza o mês: igual à Trier (05/10/2026)
--
-- Achado comparando "Vendas por Vendedor" de 01 a 04/10: Simone tinha
-- +1 venda e +R$ 329,60 no app. Era a venda 759424 (30/09), devolvida em
-- 02/10 pela nota 759794. A Trier ("Vendas menos devoluções") conta a
-- venda em SETEMBRO e desconta a devolução em OUTUBRO, valor e
-- quantidade de vendas (-1). O app tirava a venda inteira de setembro e
-- não mexia em outubro: o total dos dois meses batia, mas cada mês não.
--
-- Agora:
-- 1) fn_registrar_devolucao(origem, devolucao, data_devolucao, totais):
--    - devolução no MESMO mês da venda: marca a venda como 'D' (como
--      sempre foi; venda + devolução no mesmo mês = zero, igual à Trier);
--    - devolução em OUTRO mês: a venda original volta a contar no mês
--      dela, e entra um lançamento de devolução no mês da devolução —
--      uma linha em vendas (numero_nota = nota da devolução,
--      numero_nota_origem = nota original) com os itens da original com
--      sinal trocado (quantidade, valores e custo negativos; mesma foto de
--      custo unitário da venda). Tudo que soma valor (Painel, Metas,
--      Comissão, Relatório mensal, Venda adicional) desconta sozinho;
--    - devolução PARCIAL continua de fora (a API não diz quais itens).
--    Idempotente: chamar de novo com a mesma devolução não faz nada.
-- 2) Painel: a linha de devolução conta -1 venda (Qtd. Vendas e ticket
--    médio iguais aos da Trier).
-- 3) Corrige o histórico de 2026 (15 devoluções totais que cruzam o mês;
--    3 com venda original de 2025 ficam de fora — não há histórico).
--
-- O n8n (sgf-incremental, nó da devolução) passa a chamar a função em
-- vez do UPDATE direto. Rodar DEPOIS de migracao_custo_venda_snapshot.sql.
-- ============================================================

create or replace function fn_registrar_devolucao(
  p_nota_origem integer,
  p_nota_devolucao integer,
  p_data_devolucao date,
  p_total_devolucao numeric,
  p_total_origem numeric,
  p_cod_filial integer default 1
)
returns text
language plpgsql
as $$
declare
  v_origem vendas%rowtype;
  v_dev_id bigint;
begin
  -- parcial: a API não diz quais itens voltaram
  if abs(coalesce(p_total_devolucao, 0) - coalesce(p_total_origem, 0)) >= 0.01 then
    return 'parcial (ignorada)';
  end if;

  select * into v_origem
  from vendas
  where numero_nota = p_nota_origem and cod_filial = p_cod_filial
    and numero_nota_origem is null
  order by id
  limit 1;

  if not found then
    return 'venda original nao encontrada';
  end if;

  -- mesmo mês: some a venda (venda + devolução = zero no mês)
  if date_trunc('month', v_origem.data_emissao) = date_trunc('month', p_data_devolucao) then
    update vendas set tipo_cancelamento = 'D', updated_at = now()
    where id = v_origem.id and tipo_cancelamento is distinct from 'D';
    return 'mesmo mes: venda marcada D';
  end if;

  -- outro mês: a venda original conta no mês dela (desfaz o 'D' antigo;
  -- exclusão 'E' não é mexida)...
  if v_origem.tipo_cancelamento = 'D' then
    update vendas set tipo_cancelamento = null, updated_at = now()
    where id = v_origem.id;
  elsif v_origem.tipo_cancelamento is not null then
    return 'venda original cancelada (' || v_origem.tipo_cancelamento || '), nada a fazer';
  end if;

  -- ...e a devolução desconta no mês da devolução
  if exists (
    select 1 from vendas
    where numero_nota = p_nota_devolucao and cod_filial = p_cod_filial
      and numero_nota_origem = p_nota_origem
  ) then
    return 'outro mes: devolucao ja lancada';
  end if;

  insert into vendas (
    numero_nota, numero_nota_origem, tipo_cancelamento, data_emissao, hora_emissao,
    codigo_vendedor, codigo_cliente, entrega, pagamento_na_entrega, condicao_pagamento,
    cod_filial, updated_at
  )
  values (
    p_nota_devolucao, p_nota_origem, null, p_data_devolucao, '00:00:00',
    v_origem.codigo_vendedor, v_origem.codigo_cliente, false, false, v_origem.condicao_pagamento,
    p_cod_filial, now()
  )
  returning id into v_dev_id;

  insert into venda_itens (
    venda_id, codigo_produto, codigo_vendedor, quantidade_produtos,
    valor_total_bruto, valor_total_liquido, valor_total_custo,
    parceiro, codigo_medico, cod_barras, num_sequencial, prc_comissao,
    vlr_desconto, vlr_unitario, vlr_custo_aquisicao, vlr_custo_produto,
    tabela_desconto, prc_desconto, prc_desconto_max, venda_com_desconto,
    custo_trier, custo_unitario_medio
  )
  select
    v_dev_id, vi.codigo_produto, vi.codigo_vendedor, -vi.quantidade_produtos,
    -vi.valor_total_bruto, -vi.valor_total_liquido, -vi.valor_total_custo,
    vi.parceiro, vi.codigo_medico, vi.cod_barras, vi.num_sequencial, vi.prc_comissao,
    -vi.vlr_desconto, vi.vlr_unitario, -vi.vlr_custo_aquisicao, -vi.vlr_custo_produto,
    vi.tabela_desconto, vi.prc_desconto, vi.prc_desconto_max, vi.venda_com_desconto,
    -vi.custo_trier, vi.custo_unitario_medio
  from venda_itens vi
  where vi.venda_id = v_origem.id;

  return 'outro mes: devolucao lancada em ' || p_data_devolucao;
end;
$$;

comment on function fn_registrar_devolucao(integer, integer, date, numeric, numeric, integer) is
  'Devolução total igual à Trier: mesmo mês -> venda marcada D; outro mês -> venda conta no mês dela e entra lançamento negativo (vendas.numero_nota_origem preenchido) no mês da devolução. Parcial: ignorada.';

-- ---------- Painel: devolução conta -1 venda (base: migracao_custo_venda_snapshot.sql) ----------
create or replace view vw_metricas_vendedor_diario as
select
  vd.data_emissao,
  vi.codigo_vendedor,
  (count(distinct vd.id) filter (where vd.numero_nota_origem is null) - count(distinct vd.id) filter (where vd.numero_nota_origem is not null)) as qtd_notas,
  sum(vi.valor_total_liquido) as faturamento_liquido,
  sum(vi.valor_total_bruto) as faturamento_bruto,
  sum(vi.valor_total_bruto) - sum(vi.valor_total_liquido) as total_desconto,
  round((sum(vi.valor_total_bruto) - sum(vi.valor_total_liquido)) / nullif(sum(vi.valor_total_bruto),0) * 100, 2) as taxa_desconto_pct,
  sum(vi.valor_total_liquido * (vi.prc_comissao/100.0)) as comissao_estimada,
  round(sum(vi.valor_total_liquido) / nullif((count(distinct vd.id) filter (where vd.numero_nota_origem is null) - count(distinct vd.id) filter (where vd.numero_nota_origem is not null)),0), 2) as ticket_medio,
  sum(case when vd.data_emissao >= date '2026-09-01' then vi.valor_total_custo else coalesce(vi.vlr_custo_produto, vi.valor_total_custo, vi.vlr_custo_aquisicao) * 0.92 end) as total_custo,
  round(
    (sum(vi.valor_total_liquido) - sum(case when vd.data_emissao >= date '2026-09-01' then vi.valor_total_custo else coalesce(vi.vlr_custo_produto, vi.valor_total_custo, vi.vlr_custo_aquisicao) * 0.92 end))
    / nullif(sum(vi.valor_total_liquido),0) * 100,
  2) as margem_bruta_pct,
  vend.nome as nome_vendedor
from venda_itens vi
join vendas vd on vd.id = vi.venda_id
join vendedores vend on vend.codigo = vi.codigo_vendedor
where vd.tipo_cancelamento is null
group by vd.data_emissao, vi.codigo_vendedor, vend.nome;

create or replace view vw_metricas_vendedor_mensal as
select
  extract(year from vd.data_emissao)::int as ano,
  extract(month from vd.data_emissao)::int as mes,
  vi.codigo_vendedor,
  (count(distinct vd.id) filter (where vd.numero_nota_origem is null) - count(distinct vd.id) filter (where vd.numero_nota_origem is not null)) as qtd_notas,
  sum(vi.valor_total_liquido) as faturamento_liquido,
  sum(vi.valor_total_bruto) as faturamento_bruto,
  sum(vi.valor_total_bruto) - sum(vi.valor_total_liquido) as total_desconto,
  round((sum(vi.valor_total_bruto) - sum(vi.valor_total_liquido)) / nullif(sum(vi.valor_total_bruto),0) * 100, 2) as taxa_desconto_pct,
  sum(vi.valor_total_liquido * (vi.prc_comissao/100.0)) as comissao_estimada,
  round(sum(vi.valor_total_liquido) / nullif((count(distinct vd.id) filter (where vd.numero_nota_origem is null) - count(distinct vd.id) filter (where vd.numero_nota_origem is not null)),0), 2) as ticket_medio,
  sum(case when vd.data_emissao >= date '2026-09-01' then vi.valor_total_custo else coalesce(vi.vlr_custo_produto, vi.valor_total_custo, vi.vlr_custo_aquisicao) * 0.92 end) as total_custo,
  round(
    (sum(vi.valor_total_liquido) - sum(case when vd.data_emissao >= date '2026-09-01' then vi.valor_total_custo else coalesce(vi.vlr_custo_produto, vi.valor_total_custo, vi.vlr_custo_aquisicao) * 0.92 end))
    / nullif(sum(vi.valor_total_liquido),0) * 100,
  2) as margem_bruta_pct,
  vend.nome as nome_vendedor
from venda_itens vi
join vendas vd on vd.id = vi.venda_id
join vendedores vend on vend.codigo = vi.codigo_vendedor
where vd.tipo_cancelamento is null
group by extract(year from vd.data_emissao), extract(month from vd.data_emissao), vi.codigo_vendedor, vend.nome;

create or replace view vw_metricas_vendedor_semanal as
select
  extract(year from vd.data_emissao)::int as ano,
  extract(month from vd.data_emissao)::int as mes,
  (case
    when extract(day from vd.data_emissao) <= 7 then 1
    when extract(day from vd.data_emissao) <= 14 then 2
    when extract(day from vd.data_emissao) <= 21 then 3
    else 4
  end) as semana,
  vi.codigo_vendedor,
  (count(distinct vd.id) filter (where vd.numero_nota_origem is null) - count(distinct vd.id) filter (where vd.numero_nota_origem is not null)) as qtd_notas,
  sum(vi.valor_total_liquido) as faturamento_liquido,
  sum(vi.valor_total_bruto) as faturamento_bruto,
  sum(vi.valor_total_bruto) - sum(vi.valor_total_liquido) as total_desconto,
  round((sum(vi.valor_total_bruto) - sum(vi.valor_total_liquido)) / nullif(sum(vi.valor_total_bruto),0) * 100, 2) as taxa_desconto_pct,
  sum(vi.valor_total_liquido * (vi.prc_comissao/100.0)) as comissao_estimada,
  round(sum(vi.valor_total_liquido) / nullif((count(distinct vd.id) filter (where vd.numero_nota_origem is null) - count(distinct vd.id) filter (where vd.numero_nota_origem is not null)),0), 2) as ticket_medio,
  sum(case when vd.data_emissao >= date '2026-09-01' then vi.valor_total_custo else coalesce(vi.vlr_custo_produto, vi.valor_total_custo, vi.vlr_custo_aquisicao) * 0.92 end) as total_custo,
  round(
    (sum(vi.valor_total_liquido) - sum(case when vd.data_emissao >= date '2026-09-01' then vi.valor_total_custo else coalesce(vi.vlr_custo_produto, vi.valor_total_custo, vi.vlr_custo_aquisicao) * 0.92 end))
    / nullif(sum(vi.valor_total_liquido),0) * 100,
  2) as margem_bruta_pct,
  vend.nome as nome_vendedor
from venda_itens vi
join vendas vd on vd.id = vi.venda_id
join vendedores vend on vend.codigo = vi.codigo_vendedor
where vd.tipo_cancelamento is null
group by
  extract(year from vd.data_emissao),
  extract(month from vd.data_emissao),
  (case
    when extract(day from vd.data_emissao) <= 7 then 1
    when extract(day from vd.data_emissao) <= 14 then 2
    when extract(day from vd.data_emissao) <= 21 then 3
    else 4
  end),
  vi.codigo_vendedor, vend.nome;

create or replace function fn_metricas_vendedor_periodo(data_inicio date, data_fim date)
returns table (
  codigo_vendedor integer,
  nome_vendedor text,
  qtd_notas bigint,
  faturamento_liquido numeric,
  faturamento_bruto numeric,
  total_desconto numeric,
  taxa_desconto_pct numeric,
  ticket_medio numeric,
  total_custo numeric,
  margem_bruta_pct numeric
)
language sql stable as $$
  select
    vi.codigo_vendedor,
    vend.nome as nome_vendedor,
    (count(distinct vd.id) filter (where vd.numero_nota_origem is null) - count(distinct vd.id) filter (where vd.numero_nota_origem is not null)) as qtd_notas,
    sum(vi.valor_total_liquido) as faturamento_liquido,
    sum(vi.valor_total_bruto) as faturamento_bruto,
    sum(vi.valor_total_bruto) - sum(vi.valor_total_liquido) as total_desconto,
    round((sum(vi.valor_total_bruto) - sum(vi.valor_total_liquido)) / nullif(sum(vi.valor_total_bruto), 0) * 100, 2) as taxa_desconto_pct,
    round(sum(vi.valor_total_liquido) / nullif((count(distinct vd.id) filter (where vd.numero_nota_origem is null) - count(distinct vd.id) filter (where vd.numero_nota_origem is not null)), 0), 2) as ticket_medio,
    sum(case when vd.data_emissao >= date '2026-09-01' then vi.valor_total_custo else coalesce(vi.vlr_custo_produto, vi.valor_total_custo, vi.vlr_custo_aquisicao) * 0.92 end) as total_custo,
    round(
      (sum(vi.valor_total_liquido) - sum(case when vd.data_emissao >= date '2026-09-01' then vi.valor_total_custo else coalesce(vi.vlr_custo_produto, vi.valor_total_custo, vi.vlr_custo_aquisicao) * 0.92 end))
      / nullif(sum(vi.valor_total_liquido), 0) * 100,
    2) as margem_bruta_pct
  from venda_itens vi
  join vendas vd on vd.id = vi.venda_id
  join vendedores vend on vend.codigo = vi.codigo_vendedor
  where vd.data_emissao between data_inicio and data_fim
    and vd.tipo_cancelamento is null
  group by vi.codigo_vendedor, vend.nome;
$$;

-- ---------- Histórico 2026 ----------
select h.nota_origem, h.nota_devolucao, h.data_devolucao,
       fn_registrar_devolucao(h.nota_origem, h.nota_devolucao, h.data_devolucao, h.total_devolucao, h.total_origem) as resultado
from (values
  (712922, 714033, date '2026-01-05', 61.49, 61.49),
  (715824, 719519, date '2026-02-07', 29, 29),
  (697428, 722714, date '2026-02-26', 34.71, 34.71),
  (721109, 725401, date '2026-03-12', 98.06, 98.06),
  (687271, 726449, date '2026-03-18', 45.02, 45.02),
  (724784, 728735, date '2026-04-02', 89.9, 89.9),
  (725343, 729348, date '2026-04-07', 89.61, 140),
  (731376, 734566, date '2026-05-07', 26, 26),
  (738741, 738892, date '2026-06-01', 61.13, 61.13),
  (738038, 739104, date '2026-06-02', 166.62, 166.62),
  (738651, 739357, date '2026-06-03', 35.88, 35.88),
  (738769, 739780, date '2026-06-06', 49.99, 49.99),
  (738732, 739781, date '2026-06-06', 41.9, 41.9),
  (738798, 739783, date '2026-06-06', 48.74, 48.74),
  (731602, 744494, date '2026-07-03', 35.19, 35.19),
  (759424, 759794, date '2026-10-02', 329.6, 329.6)
) as h(nota_origem, nota_devolucao, data_devolucao, total_devolucao, total_origem);
