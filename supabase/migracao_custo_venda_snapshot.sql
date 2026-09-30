-- ============================================================
-- Custo da venda = custo médio (Custo Aquisição) do dia (30/09/2026)
--
-- Comparação com o relatório "Vendas por Vendedor" da Trier (setembro,
-- 30/09): o custo que a API grava em cada item (valor_total_custo =
-- "Custo do Cadastro") passava do relatório em até +15% por vendedor
-- (Terezinha), puxado por genéricos com custo de cadastro fictício, maior
-- que o próprio preço de venda (Dapagliflozina 10mg: R$116,54 gravado x
-- R$32,70 de custo médio x ~R$77 de venda; Esomeprazol, Apixabana,
-- Bupropiona...). Com quantidade x produto_catalogo.custo_medio o custo
-- fechou com a Trier: total -0,6%, vendedores entre -3,2% e +1,8%.
--
-- O que muda (decisão do usuário: vale pra SETEMBRO INTEIRO em diante;
-- agosto e antes ficam exatamente como estavam):
--
-- 1) venda_itens ganha:
--      custo_trier           — o custo que a API mandou (auditoria)
--      custo_unitario_medio  — custo médio unitário do DIA em que a venda
--                              chegou (foto: não muda quando o custo
--                              médio do cadastro mudar depois)
--    e valor_total_custo passa a ser quantidade x custo_unitario_medio.
--    Quem já lia valor_total_custo (relatório mensal, calcular_metricas_mes)
--    passa a usar o custo certo sem mudar nada.
-- 2) Gatilho em venda_itens: o coletor (sgf-incremental / backfill) apaga
--    e regrava os itens da venda que mudou; o gatilho preenche a foto do
--    custo sozinho a cada INSERT — sem mexer no n8n.
-- 3) produto_custo_manual: custo corrigido à mão por produto, a partir de
--    uma data (quando o cadastro da Trier está errado). O gatilho usa essa
--    tabela antes do cadastro. Começa vazia.
-- 4) Painel (vw_metricas_vendedor_diario/mensal/semanal e
--    fn_metricas_vendedor_periodo) e Metas/Comissão (vw_metas_progresso):
--    a partir de 01/09/2026 usam valor_total_custo (a foto); antes disso,
--    a fórmula antiga de cada um (Painel: custo gravado x 0,92; Metas:
--    custo médio atual) — meses fechados não mudam.
--
-- Rodar DEPOIS de migracao_exclui_estorno_desempenho.sql e
-- migracao_metas_custo_aquisicao.sql. Idempotente.
-- ============================================================

alter table venda_itens
  add column if not exists custo_trier numeric(12,2),
  add column if not exists custo_unitario_medio numeric(14,4);

create table if not exists produto_custo_manual (
  codigo_produto integer primary key references produto_catalogo(codigo),
  custo_unitario numeric(14,4) not null check (custo_unitario >= 0),
  valido_desde date not null,
  motivo text,
  criado_em timestamptz not null default now()
);

alter table produto_custo_manual enable row level security;

drop policy if exists "produto_custo_manual: gestor tudo" on produto_custo_manual;
create policy "produto_custo_manual: gestor tudo"
on produto_custo_manual for all
using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'))
with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'));

-- (começa vazia — o Ozivy entrou aqui e foi retirado a pedido do gestor em
-- 30/09/2026; se a linha já existir de uma execução anterior, sai agora e
-- as vendas dele voltam pro custo médio do cadastro no preenchimento abaixo)
delete from produto_custo_manual where codigo_produto = 26204;

-- Custo unitário a usar pra um produto numa data: manual (se houver e
-- valer na data) > custo médio do cadastro (se > 0) > null (fica o da API).
create or replace function fn_custo_unitario_produto(p_codigo integer, p_data date)
returns numeric
language sql
stable
as $$
  select coalesce(
    (select m.custo_unitario from produto_custo_manual m
      where m.codigo_produto = p_codigo and m.valido_desde <= p_data),
    (select nullif(pc.custo_medio, 0) from produto_catalogo pc where pc.codigo = p_codigo)
  );
$$;

create or replace function fn_venda_itens_custo()
returns trigger
language plpgsql
as $$
declare
  v_data date;
begin
  -- custo que veio da API: guarda pra auditoria (no UPDATE, só se a API
  -- mandou um valor novo — não quando só a foto foi corrigida à mão)
  if tg_op = 'INSERT' then
    new.custo_trier := coalesce(new.custo_trier, new.valor_total_custo);
  elsif new.valor_total_custo is distinct from old.valor_total_custo then
    new.custo_trier := new.valor_total_custo;
  end if;

  select v.data_emissao into v_data from vendas v where v.id = new.venda_id;

  -- regra nova só vale a partir de 01/09/2026 (decisão do usuário)
  if v_data is null or v_data < date '2026-09-01' then
    return new;
  end if;

  -- foto do custo: no INSERT (ou se ainda não tem), pega o do dia
  if new.custo_unitario_medio is null then
    new.custo_unitario_medio := fn_custo_unitario_produto(new.codigo_produto, v_data);
  end if;

  if new.custo_unitario_medio is not null then
    new.valor_total_custo := round(coalesce(new.quantidade_produtos, 0) * new.custo_unitario_medio, 2);
  else
    new.valor_total_custo := new.custo_trier;  -- sem custo médio: fica o da API
  end if;
  return new;
end;
$$;

drop trigger if exists trg_venda_itens_custo on venda_itens;
create trigger trg_venda_itens_custo
before insert or update on venda_itens
for each row execute function fn_venda_itens_custo();

-- Preenche setembro em diante (uma vez; rodar de novo não duplica nada:
-- custo_trier só é gravado onde ainda está vazio, e a foto é refeita com
-- o custo manual/médio de hoje).
update venda_itens vi
set custo_trier = coalesce(vi.custo_trier, vi.valor_total_custo),
    custo_unitario_medio = fn_custo_unitario_produto(vi.codigo_produto, v.data_emissao)
from vendas v
where v.id = vi.venda_id
  and v.data_emissao >= date '2026-09-01';

-- ---------- Painel (base: migracao_exclui_estorno_desempenho.sql) ----------
create or replace view vw_metricas_vendedor_diario as
select
  vd.data_emissao,
  vi.codigo_vendedor,
  count(distinct vd.id) as qtd_notas,
  sum(vi.valor_total_liquido) as faturamento_liquido,
  sum(vi.valor_total_bruto) as faturamento_bruto,
  sum(vi.valor_total_bruto) - sum(vi.valor_total_liquido) as total_desconto,
  round((sum(vi.valor_total_bruto) - sum(vi.valor_total_liquido)) / nullif(sum(vi.valor_total_bruto),0) * 100, 2) as taxa_desconto_pct,
  sum(vi.valor_total_liquido * (vi.prc_comissao/100.0)) as comissao_estimada,
  round(sum(vi.valor_total_liquido) / nullif(count(distinct vd.id),0), 2) as ticket_medio,
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
  count(distinct vd.id) as qtd_notas,
  sum(vi.valor_total_liquido) as faturamento_liquido,
  sum(vi.valor_total_bruto) as faturamento_bruto,
  sum(vi.valor_total_bruto) - sum(vi.valor_total_liquido) as total_desconto,
  round((sum(vi.valor_total_bruto) - sum(vi.valor_total_liquido)) / nullif(sum(vi.valor_total_bruto),0) * 100, 2) as taxa_desconto_pct,
  sum(vi.valor_total_liquido * (vi.prc_comissao/100.0)) as comissao_estimada,
  round(sum(vi.valor_total_liquido) / nullif(count(distinct vd.id),0), 2) as ticket_medio,
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
  count(distinct vd.id) as qtd_notas,
  sum(vi.valor_total_liquido) as faturamento_liquido,
  sum(vi.valor_total_bruto) as faturamento_bruto,
  sum(vi.valor_total_bruto) - sum(vi.valor_total_liquido) as total_desconto,
  round((sum(vi.valor_total_bruto) - sum(vi.valor_total_liquido)) / nullif(sum(vi.valor_total_bruto),0) * 100, 2) as taxa_desconto_pct,
  sum(vi.valor_total_liquido * (vi.prc_comissao/100.0)) as comissao_estimada,
  round(sum(vi.valor_total_liquido) / nullif(count(distinct vd.id),0), 2) as ticket_medio,
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
    count(distinct vd.id) as qtd_notas,
    sum(vi.valor_total_liquido) as faturamento_liquido,
    sum(vi.valor_total_bruto) as faturamento_bruto,
    sum(vi.valor_total_bruto) - sum(vi.valor_total_liquido) as total_desconto,
    round((sum(vi.valor_total_bruto) - sum(vi.valor_total_liquido)) / nullif(sum(vi.valor_total_bruto), 0) * 100, 2) as taxa_desconto_pct,
    round(sum(vi.valor_total_liquido) / nullif(count(distinct vd.id), 0), 2) as ticket_medio,
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

-- ---------- Metas / Comissão (base: migracao_metas_custo_aquisicao.sql) ----------
create or replace view vw_metas_progresso as
select
  m.id as meta_id,
  m.codigo_vendedor,
  vd.nome as nome_vendedor,
  m.ano,
  m.mes,
  m.semana,
  m.valor_meta,
  coalesce(realizado.valor, 0) as valor_realizado
from metas m
join vendedores vd on vd.codigo = m.codigo_vendedor
left join lateral (
  select
    sum(vi.valor_total_liquido) - sum(
      case when v.data_emissao >= date '2026-09-01' then vi.valor_total_custo  -- foto do custo (30/09/2026)
      else vi.quantidade_produtos * coalesce(pc.custo_medio, 0) end
    ) as valor
  from vendas v
  join venda_itens vi on vi.venda_id = v.id
  left join produto_catalogo pc on pc.codigo = vi.codigo_produto
  where v.codigo_vendedor = m.codigo_vendedor
    and v.tipo_cancelamento is null
    and extract(year from v.data_emissao) = m.ano
    and extract(month from v.data_emissao) = m.mes
    and (
      m.semana is null
      or (m.semana = 1 and extract(day from v.data_emissao) between 1 and 7)
      or (m.semana = 2 and extract(day from v.data_emissao) between 8 and 14)
      or (m.semana = 3 and extract(day from v.data_emissao) between 15 and 21)
      or (m.semana = 4 and extract(day from v.data_emissao) >= 22)
    )
) realizado on true;
