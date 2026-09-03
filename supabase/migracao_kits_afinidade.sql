-- Kits multi-produto por afinidade de compra (02/09/2026) — DIFERENTE
-- do kit já existente em campanha_produtos (que é "leve mais unidades
-- do MESMO produto com desconto na extra"). Aqui o kit junta produtos
-- DIFERENTES que os clientes já compram juntos na prática (ex.:
-- fralda + lenço umedecido), sugerido a partir de dado real de venda
-- via fn_sugerir_pares_afinidade (mais abaixo). Suporta dois formatos
-- de precificação: percentual de desconto no combo, ou preço fixo do
-- pacote (ex.: "3 por R$9,99") — esse segundo formato não existia em
-- lugar nenhum do schema até agora.
create table campanha_kits (
  id bigserial primary key,
  campanha_id bigint not null references campanhas(id) on delete cascade,
  nome text,
  tipo_precificacao text not null check (tipo_precificacao in ('percentual', 'preco_fixo')),
  -- Nomes de coluna reaproveitados de campanha_produtos.percentual_desconto
  -- de propósito, pra manter o mesmo modelo mental entre os dois tipos
  -- de kit (mesmo produto vs. produtos diferentes).
  percentual_desconto_item numeric(5,2) check (percentual_desconto_item is null or percentual_desconto_item between 0 and 100),
  preco_fixo numeric(12,2) check (preco_fixo is null or preco_fixo > 0),
  quantidade_cartazes integer not null default 1 check (quantidade_cartazes > 0),
  -- Override de validade por kit — null = segue a validade da campanha,
  -- mesmo padrão de campanha_produtos.data_inicio/data_fim.
  data_inicio date,
  data_fim date,
  created_at timestamptz not null default now(),
  constraint campanha_kits_precificacao_coerente check (
    (tipo_precificacao = 'percentual' and percentual_desconto_item is not null and preco_fixo is null)
    or (tipo_precificacao = 'preco_fixo' and preco_fixo is not null and percentual_desconto_item is null)
  )
);

create table campanha_kit_produtos (
  id bigserial primary key,
  kit_id bigint not null references campanha_kits(id) on delete cascade,
  codigo_produto integer not null references produto_catalogo(codigo),
  quantidade integer not null default 1 check (quantidade > 0),
  unique (kit_id, codigo_produto)
);

create index idx_campanha_kits_campanha on campanha_kits (campanha_id);
create index idx_campanha_kit_produtos_kit on campanha_kit_produtos (kit_id);

-- RLS: mesmo predicado "gestor tudo" de campanhas/campanha_produtos
-- (rls_policies.sql) — kit multi-produto é decisão de negócio igual,
-- vendedor não mexe.
alter table campanha_kits enable row level security;
alter table campanha_kit_produtos enable row level security;

create policy "campanha_kits: gestor tudo"
on campanha_kits for all
using (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
))
with check (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
));

create policy "campanha_kit_produtos: gestor tudo"
on campanha_kit_produtos for all
using (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
))
with check (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
));

-- ============================================================
-- fn_sugerir_pares_afinidade — motor de "market basket analysis":
-- pra uma lista de códigos-semente (resolvida no app via
-- macroGrupoDoProduto, que só existe em TS), acha produtos DIFERENTES
-- que aparecem MUITO na mesma venda junto com a semente, medido por
-- lift (o quanto a co-ocorrência real supera o esperado se as vendas
-- dos dois produtos fossem independentes).
--
-- Segue o padrão exato de fn_venda_periodo_produto/
-- fn_metricas_vendedor_periodo (schema.sql): language sql stable, SEM
-- security definer e SEM grant execute explícito — vendas/venda_itens/
-- produto_catalogo já são SELECT-abertas a qualquer autenticado
-- (rls_policies.sql), então não tem ceremonial extra necessário aqui
-- (diferente de calcular_metricas_mes, que É security definer porque
-- ESCREVE dado fora do que a RLS do chamador permitiria).
--
-- Restringir o lado "a" do self-join a p_codigos_seed mantém a
-- consulta barata mesmo com venda_itens grande, graças aos índices já
-- existentes (idx_itens_venda, idx_itens_produto,
-- idx_vendas_data_emissao).
create or replace function fn_sugerir_pares_afinidade(
  p_codigos_seed integer[],
  p_dias integer default 120,
  p_min_co_ocorrencias integer default 8,
  p_lift_minimo numeric default 1.2,
  p_limite integer default 50
)
returns table (
  codigo_produto_seed integer,
  codigo_produto_parceiro integer,
  co_ocorrencias bigint,
  vendas_seed bigint,
  vendas_parceiro bigint,
  lift numeric
)
language sql
stable
as $$
  with janela as (
    select v.id as venda_id
    from vendas v
    where v.data_emissao >= current_date - make_interval(days => p_dias)
      and v.tipo_cancelamento is null -- venda cancelada/devolvida não é evidência real de compra conjunta
  ),
  total as (
    select count(*) as n from janela
  ),
  contagem_produto as (
    select vi.codigo_produto, count(distinct vi.venda_id) as vendas
    from venda_itens vi
    join janela j on j.venda_id = vi.venda_id
    group by vi.codigo_produto
  ),
  pares as (
    select
      a.codigo_produto as seed,
      b.codigo_produto as parceiro,
      count(distinct a.venda_id) as co_ocorrencias
    from venda_itens a
    join janela j on j.venda_id = a.venda_id
    join venda_itens b on b.venda_id = a.venda_id and b.codigo_produto <> a.codigo_produto
    where a.codigo_produto = any(p_codigos_seed)
    group by a.codigo_produto, b.codigo_produto
    having count(distinct a.venda_id) >= p_min_co_ocorrencias
  )
  select
    p.seed,
    p.parceiro,
    p.co_ocorrencias,
    cs.vendas,
    cp.vendas,
    round((p.co_ocorrencias::numeric * (select n from total)) / nullif(cs.vendas * cp.vendas, 0), 2) as lift
  from pares p
  join contagem_produto cs on cs.codigo_produto = p.seed
  join contagem_produto cp on cp.codigo_produto = p.parceiro
  where (p.co_ocorrencias::numeric * (select n from total)) / nullif(cs.vendas * cp.vendas, 0) >= p_lift_minimo
  order by lift desc, co_ocorrencias desc
  limit p_limite;
$$;

-- ---------- VERIFICAÇÃO (opcional, só leitura) ----------
-- Troque os códigos abaixo por códigos reais do seu catálogo antes de
-- rodar (ex.: alguns produtos de "fraldas" ou "desodorante"):
-- select * from fn_sugerir_pares_afinidade(array[1001, 1002, 1003]);
