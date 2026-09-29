-- ============================================================
-- Sugestão de compras — fórmula "inteligente" (29/09/2026, fase 2 etapa 4)
--
-- 1) fn_venda_periodo_produto contava venda CANCELADA/DEVOLVIDA na
--    demanda (todo o resto do app filtra tipo_cancelamento desde
--    26/08/2026). Corrigida aqui, mesma assinatura.
--
-- 2) fn_estatistica_venda_produto: o que a fórmula nova precisa por
--    produto, numa passada só —
--      quantidade_periodo / quantidade_recente  -> tendência
--      soma_quadrados_diaria                    -> variação diária (desvio
--        padrão com os dias SEM venda contando como zero:
--        sqrt(soma_q2/dias - média²), calculado no app)
--      faturamento_periodo                      -> curva ABC
--
-- 3) compras_pedidos_pendentes: "já pedi" — quantidade pedida ao
--    fornecedor que ainda não chegou. A API da Trier não mostra os
--    pedidos do Dose Certa (medido em 29/09/2026: 0 itens em 30 dias),
--    então o comprador marca no app. Vale até previsao_chegada (+2 dias
--    de tolerância); depois some sozinho da conta.
--
-- Idempotente.
-- ============================================================

create or replace function fn_venda_periodo_produto(dias integer)
returns table (codigo_produto integer, quantidade_vendida numeric)
language sql
stable
as $$
  select
    vi.codigo_produto,
    sum(vi.quantidade_produtos) as quantidade_vendida
  from venda_itens vi
  join vendas v on v.id = vi.venda_id
  where v.data_emissao >= current_date - make_interval(days => dias)
    and v.tipo_cancelamento is null
  group by vi.codigo_produto;
$$;

create or replace function fn_estatistica_venda_produto(dias integer, dias_recentes integer default 14)
returns table (
  codigo_produto integer,
  quantidade_periodo numeric,
  quantidade_recente numeric,
  soma_quadrados_diaria numeric,
  faturamento_periodo numeric
)
language sql
stable
as $$
  with diario as (
    select
      vi.codigo_produto,
      v.data_emissao as dia,
      sum(vi.quantidade_produtos) as qtd,
      sum(vi.valor_total_liquido) as receita
    from venda_itens vi
    join vendas v on v.id = vi.venda_id
    where v.data_emissao >= current_date - make_interval(days => dias)
      and v.tipo_cancelamento is null
      and vi.quantidade_produtos > 0
    group by 1, 2
  )
  select
    codigo_produto,
    sum(qtd) as quantidade_periodo,
    coalesce(sum(qtd) filter (where dia >= current_date - make_interval(days => dias_recentes)), 0) as quantidade_recente,
    sum(qtd * qtd) as soma_quadrados_diaria,
    coalesce(sum(receita), 0) as faturamento_periodo
  from diario
  group by codigo_produto;
$$;

create table if not exists compras_pedidos_pendentes (
  id bigserial primary key,
  codigo_produto integer not null unique references produto_catalogo(codigo),
  quantidade numeric(12,3) not null check (quantidade > 0),
  pedido_em timestamptz not null default now(),
  previsao_chegada date not null default (current_date + 7),
  criado_por uuid references profiles(id)
);

alter table compras_pedidos_pendentes enable row level security;

-- Mesmo acesso da aba Compras: só gestor (ver migracao_compras_classificacao.sql).
drop policy if exists "compras_pedidos_pendentes: gestor tudo" on compras_pedidos_pendentes;
create policy "compras_pedidos_pendentes: gestor tudo"
on compras_pedidos_pendentes for all
using (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
))
with check (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
));

comment on table compras_pedidos_pendentes is
  '"Já pedi" da aba Compras: quantidade pedida ao fornecedor que ainda não chegou — descontada da sugestão até previsao_chegada + 2 dias. Um registro por produto (marcar de novo substitui).';
