-- ============================================================
-- CONTROLE DE SINCRONIZAÇÃO (usado pelo coletor)
-- ============================================================
create table sync_control (
  entity_name text primary key,       -- ex: 'venda', 'cliente', 'vendedor'
  last_synced_at timestamptz,         -- quando rodou com sucesso
  last_cursor timestamptz             -- valor usado como dataInicial na próxima chamada obter-alterados
);

-- ============================================================
-- VENDEDOR (VendedorIntegracaoDto)
-- ============================================================
create table vendedores (
  codigo integer primary key,
  nome text not null,
  numero_cpf text,
  cep text,
  email text,
  ativo boolean default true,
  updated_at timestamptz default now()
);

-- ============================================================
-- CLIENTE (ClienteIntegracaoDto)
-- ============================================================
create table clientes (
  codigo integer primary key,
  nome text,
  numero_cpf_cnpj text,
  codigo_cidade text,
  email text,
  cep text,
  estado text,
  fone text,
  bairro text,
  logradouro text,
  numero_endereco text,
  ativo boolean default true,
  grupo jsonb,              -- objeto "Grupo" retornado pela API, guardado como está
  empresa_convenio jsonb,    -- objeto "EmpresaConvenio" retornado pela API
  updated_at timestamptz default now()
);

-- ============================================================
-- VENDA (VendaIntegracaoDto) — cabeçalho da nota
-- ============================================================
create table vendas (
  id bigserial primary key,
  numero_nota integer not null,
  numero_nota_origem integer,
  tipo_cancelamento text,
  data_emissao date not null,
  hora_emissao time,
  codigo_vendedor integer references vendedores(codigo),
  codigo_cliente integer references clientes(codigo),
  entrega boolean default false,
  pagamento_na_entrega boolean default false,
  condicao_pagamento jsonb,      -- objeto "CondicaoPagamento" da API
  vlr_troco numeric(12,2),
  numero_cupom_fiscal integer,
  numero_nota_fiscal integer,
  xml_nfe text,
  cod_parceiro integer,
  cod_filial integer,
  venda_ifood boolean default false,
  venda_ecommerce boolean default false,
  cod_ecommerce text,
  ser_nota_fiscal text,
  modelo_venda text,
  dados_entrega jsonb,
  updated_at timestamptz default now(),
  unique (numero_nota, cod_filial, ser_nota_fiscal)
);

create index idx_vendas_data_emissao on vendas (data_emissao);
create index idx_vendas_vendedor on vendas (codigo_vendedor);
create index idx_vendas_cliente on vendas (codigo_cliente);

-- ============================================================
-- ITEM DE VENDA (VendaItemIntegracaoDto)
-- ============================================================
create table venda_itens (
  id bigserial primary key,
  venda_id bigint not null references vendas(id) on delete cascade,
  codigo_produto integer not null,
  codigo_vendedor integer references vendedores(codigo),
  quantidade_produtos numeric(12,3),
  valor_total_bruto numeric(12,2),
  valor_total_liquido numeric(12,2),
  valor_total_custo numeric(12,2),
  parceiro text,
  codigo_medico integer,
  cod_barras text,
  num_sequencial integer,
  prc_comissao numeric(6,3),      -- percentual de comissão
  vlr_desconto numeric(12,2),
  vlr_unitario numeric(12,2),
  vlr_custo_aquisicao numeric(12,2),
  vlr_custo_produto numeric(12,2),
  tabela_desconto text,
  prc_desconto numeric(6,3),
  prc_desconto_max numeric(6,3),
  venda_com_desconto boolean default false
);

create index idx_itens_venda on venda_itens (venda_id);
create index idx_itens_vendedor on venda_itens (codigo_vendedor);
create index idx_itens_produto on venda_itens (codigo_produto);

-- ============================================================
-- PRODUTOS — NÃO vem da API SGF (a Trier não expõe catálogo de
-- produtos no escopo integrado). Curadoria manual da farmácia:
-- só entram aqui os produtos que a farmácia quer rastrear pra
-- promoção e/ou controle de receita — não é o catálogo inteiro.
-- `codigo` é o mesmo codigoProduto que aparece em venda_itens,
-- mas SEM foreign key formal: a imensa maioria dos produtos
-- vendidos nunca vai ter linha aqui, e venda_itens é alimentada
-- pelo coletor (API), que não sabe nada sobre essa curadoria.
-- ============================================================
create table produtos (
  codigo integer primary key,
  nome text not null,
  preco_atual numeric(12,2) not null,
  preco_anterior numeric(12,2),
  em_promocao boolean not null default false,
  percentual_desconto numeric(5,2),
  exige_receita boolean not null default false,
  tipo_receita text check (tipo_receita in ('comum', 'controle_especial', 'antimicrobiano')),
  updated_at timestamptz default now(),
  constraint produtos_tipo_receita_coerente check (
    (exige_receita = false and tipo_receita is null) or
    (exige_receita = true and tipo_receita is not null)
  )
);

create index idx_produtos_em_promocao on produtos (em_promocao) where em_promocao = true;
create index idx_produtos_exige_receita on produtos (exige_receita) where exige_receita = true;

-- ============================================================
-- RECEITAS DE PRODUTOS CONTROLADOS — registro de que o
-- vendedor fotografou/anexou a receita de um item vendido que
-- exige. Preenchida pelo próprio app (não pelo coletor). A foto
-- em si fica num bucket do Supabase Storage (ex.: "receitas");
-- aqui guardamos só a referência (path/URL).
-- ============================================================
create table venda_item_receitas (
  id bigserial primary key,
  venda_item_id bigint not null unique references venda_itens(id) on delete cascade,
  tipo_receita text not null check (tipo_receita in ('comum', 'controle_especial', 'antimicrobiano')),
  foto_url text,
  anexado_por uuid references auth.users(id),
  data_anexo timestamptz not null default now()
);

-- ============================================================
-- METAS — mensal + 4 buckets semanais fixos (1–7, 8–14, 15–21,
-- 22–fim do mês), por vendedor. Cadastrada manualmente pelo
-- gestor (aba "Metas" do app) — não vem da API SGF.
-- `semana` null representa a meta do mês inteiro; 1–4 são os
-- buckets semanais. Dois índices únicos parciais porque NULL não
-- é bloqueado por unique constraint comum (cada NULL é distinto).
-- ============================================================
create table metas (
  id bigserial primary key,
  codigo_vendedor integer not null references vendedores(codigo),
  ano integer not null,
  mes integer not null check (mes between 1 and 12),
  semana integer check (semana between 1 and 4),
  valor_meta numeric(12,2) not null check (valor_meta >= 0),
  updated_at timestamptz default now()
);

create unique index metas_mensal_unique on metas (codigo_vendedor, ano, mes) where semana is null;
create unique index metas_semanal_unique on metas (codigo_vendedor, ano, mes, semana) where semana is not null;

-- ============================================================
-- ATENDIMENTOS DIÁRIOS POR VENDEDOR (VendasVendedorIntegracaoDto)
-- ============================================================
create table vendas_vendedor_diario (
  data_emissao date not null,
  codigo_vendedor integer not null references vendedores(codigo),
  quantidade_itens integer,
  quantidade_atendimentos integer,
  primary key (data_emissao, codigo_vendedor)
);

-- ============================================================
-- VIEWS ANALÍTICAS (o app consome estas, não as tabelas cruas)
-- ============================================================

-- Ticket médio e itens por atendimento, por vendedor/dia
create view vw_desempenho_vendedor_diario as
select
  vvd.data_emissao,
  vvd.codigo_vendedor,
  v.nome as nome_vendedor,
  vvd.quantidade_atendimentos,
  vvd.quantidade_itens,
  round(vvd.quantidade_itens::numeric / nullif(vvd.quantidade_atendimentos,0), 2) as itens_por_atendimento
from vendas_vendedor_diario vvd
join vendedores v on v.codigo = vvd.codigo_vendedor;

-- Ticket médio, desconto e comissão calculados a partir dos itens de venda
create view vw_metricas_vendedor_diario as
select
  vd.data_emissao,
  vi.codigo_vendedor,
  count(distinct vd.id) as qtd_notas,
  sum(vi.valor_total_liquido) as faturamento_liquido,
  sum(vi.valor_total_bruto) as faturamento_bruto,
  sum(vi.vlr_desconto) as total_desconto,
  round(sum(vi.vlr_desconto) / nullif(sum(vi.valor_total_bruto),0) * 100, 2) as taxa_desconto_pct,
  sum(vi.valor_total_liquido * (vi.prc_comissao/100.0)) as comissao_estimada,
  round(sum(vi.valor_total_liquido) / nullif(count(distinct vd.id),0), 2) as ticket_medio
from venda_itens vi
join vendas vd on vd.id = vi.venda_id
group by vd.data_emissao, vi.codigo_vendedor;

-- Ranking diário de vendedores (por faturamento líquido)
create view vw_ranking_vendedores_dia as
select
  data_emissao,
  codigo_vendedor,
  faturamento_liquido,
  rank() over (partition by data_emissao order by faturamento_liquido desc) as posicao
from vw_metricas_vendedor_diario;

-- Vendas por canal (presencial vs ecommerce vs ifood)
create view vw_vendas_por_canal as
select
  data_emissao,
  case
    when venda_ifood then 'ifood'
    when venda_ecommerce then 'ecommerce'
    else 'presencial'
  end as canal,
  count(*) as qtd_vendas,
  sum(vlr_troco) as vlr_troco_total
from vendas
group by data_emissao, canal;

-- Clientes ativos vs inativos (sem compra nos últimos 60 dias)
create view vw_clientes_inatividade as
select
  c.codigo,
  c.nome,
  c.fone as telefone,
  max(v.data_emissao) as ultima_compra,
  (current_date - max(v.data_emissao)) as dias_sem_comprar,
  case when max(v.data_emissao) < current_date - interval '60 days' then true else false end as inativo
from clientes c
left join vendas v on v.codigo_cliente = c.codigo
group by c.codigo, c.nome, c.fone;

-- Status de receita dos produtos controlados vendidos (tela "Receitas"
-- do app). security_invoker=true (ver rls_policies.sql): respeita a
-- RLS de vendas/venda_itens, então vendedor só vê os próprios itens.
create view vw_vendas_receita_status as
select
  vi.id as venda_item_id,
  v.data_emissao as data_venda,
  p.codigo as codigo_produto,
  p.nome as nome_produto,
  p.tipo_receita,
  v.codigo_cliente,
  c.nome as nome_cliente,
  v.codigo_vendedor,
  vd.nome as nome_vendedor,
  (r.id is not null) as receita_anexada,
  r.data_anexo,
  r.foto_url
from venda_itens vi
join vendas v on v.id = vi.venda_id
join produtos p on p.codigo = vi.codigo_produto and p.exige_receita = true
left join clientes c on c.codigo = v.codigo_cliente
left join vendedores vd on vd.codigo = v.codigo_vendedor
left join venda_item_receitas r on r.venda_item_id = vi.id;

-- Alertas de promoção (tela "Alertas" do app): produtos em promoção e,
-- pra cada um, os clientes que já compraram antes. Propositalmente SEM
-- security_invoker — roda com o privilégio do dono (bypassa a RLS de
-- vendas/venda_itens/clientes), porque aqui a regra de negócio é "todo
-- vendedor pode ver oportunidades de contato de qualquer cliente", ao
-- contrário das outras views que restringem vendedor aos próprios dados.
create view vw_produtos_promocao_clientes as
select
  p.codigo as codigo_produto,
  p.nome as nome_produto,
  p.preco_atual,
  p.preco_anterior,
  p.percentual_desconto,
  c.codigo as codigo_cliente,
  c.nome as nome_cliente,
  c.fone as telefone_cliente,
  max(v.data_emissao) as ultima_compra_produto,
  sum(vi.quantidade_produtos) as quantidade_total
from produtos p
join venda_itens vi on vi.codigo_produto = p.codigo
join vendas v on v.id = vi.venda_id
join clientes c on c.codigo = v.codigo_cliente
where p.em_promocao = true
group by p.codigo, p.nome, p.preco_atual, p.preco_anterior, p.percentual_desconto, c.codigo, c.nome, c.fone;

-- Progresso de metas (mensal e semanal) — tela "Metas" (gestor) e o
-- bloco de metas no Dashboard (todos). O "realizado" é calculado na
-- hora, a partir de vendas/venda_itens reais — diferente do mock do
-- app, aqui não precisa de dado ilustrativo. security_invoker=true:
-- respeita a RLS de `metas` (vendedor só as próprias) e, por tabela,
-- de vendas/venda_itens também.
create view vw_metas_progresso as
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
  select sum(vi.valor_total_liquido) as valor
  from vendas v
  join venda_itens vi on vi.venda_id = v.id
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
