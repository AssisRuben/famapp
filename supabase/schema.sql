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
  max(v.data_emissao) as ultima_compra,
  (current_date - max(v.data_emissao)) as dias_sem_comprar,
  case when max(v.data_emissao) < current_date - interval '60 days' then true else false end as inativo
from clientes c
left join vendas v on v.codigo_cliente = c.codigo
group by c.codigo, c.nome;
