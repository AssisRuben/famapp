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

-- Meta DIÁRIA propositalmente NÃO tem tabela própria: é sempre a meta
-- mensal dividida pelos dias do mês (ver metaDiaria() em src/lib/metas.ts
-- no app, e a mesma conta replicada em vw_metas_progresso/dashboard). Isso
-- evita um terceiro nível de cadastro que poderia dessincronizar do
-- mensal — decisão tomada de propósito, não pendência.

-- ============================================================
-- FAIXAS_COMISSAO — régua de comissão sobre margem bruta, por
-- percentual de meta MENSAL atingido (comissão não é calculada por
-- semana nem por dia, só no fechamento do mês). Tabela (não CASE fixo
-- no SQL) pra a farmácia poder ajustar os percentuais sem reaplicar
-- schema. `percentual_meta_min` é o piso da faixa (inclusive); a faixa
-- aplicada é a de maior piso que o percentual atingido alcança — ex.:
-- 95% atingido cai na faixa de piso 90 (8%), não na de 100.
-- ============================================================
create table faixas_comissao (
  id bigserial primary key,
  percentual_meta_min numeric(5,2) not null check (percentual_meta_min >= 0),
  percentual_comissao numeric(5,2) not null check (percentual_comissao >= 0),
  updated_at timestamptz default now()
);

create unique index faixas_comissao_min_unique on faixas_comissao (percentual_meta_min);

insert into faixas_comissao (percentual_meta_min, percentual_comissao) values
  (100, 10),
  (90, 8),
  (80, 7),
  (70, 5),
  (0, 3);

-- ============================================================
-- CHECKLIST DIÁRIO — atividades cadastradas pelo gestor (aba "Metas"
-- do app) e marcadas pelo vendedor todo dia. Hoje só existe como mock
-- local (AsyncStorage) no app; estas duas tabelas são o próximo passo
-- pra ter histórico real de conclusão no backend.
-- `horario` (HH:mm) dispara lembrete push de segunda a sábado — ver
-- src/lib/notifications.ts no app. `checklist_respostas` é uma marcação
-- por atividade/vendedor/dia (não por venda), única por dia — evita
-- duplicar/perder a marcação se o vendedor reabrir o app.
-- ============================================================
create table atividades_checklist (
  id bigserial primary key,
  titulo text not null,
  horario time,
  ativo boolean not null default true,
  created_at timestamptz default now()
);

create table checklist_respostas (
  id bigserial primary key,
  atividade_id bigint not null references atividades_checklist(id) on delete cascade,
  codigo_vendedor integer not null references vendedores(codigo),
  data date not null,
  concluida boolean not null default false,
  concluida_em timestamptz,
  unique (atividade_id, codigo_vendedor, data)
);

create index idx_checklist_respostas_vendedor_data on checklist_respostas (codigo_vendedor, data);

-- ============================================================
-- PRODUTO_CATALOGO — futuramente sincronizado do ProdutoIntegracaoDto
-- real (Trier: /integracao/produto/obter-*), quando o token for
-- liberado. Diferente de `produtos` (curadoria manual pequena, só
-- promoção/receita): este é o catálogo cheio (nome, custo, estoque,
-- categoria, marca), usado pelo módulo de Campanhas/Cartazetes pra
-- calcular margem e decidir o que promover.
-- ============================================================
create table produto_catalogo (
  codigo integer primary key,
  codigo_barras text,
  nome text not null,
  categoria text,
  marca text,
  preco_venda numeric(12,2) not null,
  custo_medio numeric(12,2) not null,
  estoque_atual integer not null default 0,
  updated_at timestamptz default now()
);

create index idx_produto_catalogo_categoria on produto_catalogo (categoria);

-- ============================================================
-- FORNECEDORES / COMPRAS — espelha FornecedorIntegracaoDto e
-- CompraIntegracaoDto/ComprasItemIntegracaoDto (só leitura, igual
-- venda/cliente). Alimenta a "Lista de compras" (Compras/Dose Certa):
-- fornecedor sugerido e fator de compra (conversão de embalagem) de
-- cada produto são INFERIDOS da compra mais recente, não cadastrados
-- à mão — a API não expõe um cadastro "fornecedor preferido por
-- produto" separado. Prazo de entrega e data de última cotação (que
-- aparecem na tela do Dose Certa dentro do Trier) NÃO têm endpoint de
-- leitura na integração — não dá pra trazer isso sem inventar dado.
-- ============================================================
create table fornecedores (
  codigo integer primary key,
  nome_fantasia text not null,
  razao_social text,
  numero_cnpj text,
  nome_cidade text,
  email text,
  ativo boolean default true,
  updated_at timestamptz default now()
);

create table compras (
  id bigserial primary key,
  data_entrada timestamptz not null,
  numero_nota_fiscal integer,
  codigo_fornecedor integer references fornecedores(codigo),
  valor_total_nota numeric(12,2),
  valor_total_produtos numeric(12,2),
  quantidade_itens integer,
  chave_acesso_nfe text,
  updated_at timestamptz default now()
);

create index idx_compras_data_entrada on compras (data_entrada);
create index idx_compras_fornecedor on compras (codigo_fornecedor);

create table compras_itens (
  id bigserial primary key,
  compra_id bigint not null references compras(id) on delete cascade,
  codigo_produto integer not null,
  quantidade_produtos integer,
  fator_compra integer default 1,      -- unidades por caixa/pacote do fornecedor
  valor_unitario numeric(12,2),
  valor_unitario_liquido numeric(12,2),
  valor_custo numeric(12,2),
  valor_st numeric(12,2)
);

create index idx_compras_itens_compra on compras_itens (compra_id);
create index idx_compras_itens_produto on compras_itens (codigo_produto);

-- ============================================================
-- CAMPANHAS — promoção avulsa decidida pela farmácia (margem +
-- estoque + venda recente), FORA do encarte oficial. O Trier NÃO tem
-- endpoint de escrita pra desconto/campanha (só leitura, igual
-- venda/cliente) — por isso "campanha" é uma entidade NOSSA, sem
-- espelho no sistema deles. O preço só vale no caixa depois que o
-- .txt gerado pela tela de Cartazetes é importado manualmente no
-- Trier (ver docs/txt.txt — layout inferido, não documentado
-- oficialmente pela Trier).
-- ============================================================
create table campanhas (
  id bigserial primary key,
  nome text not null,
  data_inicio date not null,
  data_fim date not null,
  criado_por uuid references auth.users(id),
  created_at timestamptz default now(),
  constraint campanhas_datas_coerentes check (data_fim >= data_inicio)
);

create table campanha_produtos (
  id bigserial primary key,
  campanha_id bigint not null references campanhas(id) on delete cascade,
  codigo_produto integer not null references produto_catalogo(codigo),
  preco_promocional numeric(12,2) not null check (preco_promocional > 0),
  percentual_desconto numeric(5,2) not null default 0,
  quantidade_cartazes integer not null default 1 check (quantidade_cartazes > 0),
  unique (campanha_id, codigo_produto)
);

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

-- Ticket médio, desconto, comissão e margem calculados a partir dos
-- itens de venda. Margem bruta = valor de venda (faturamento líquido,
-- já com desconto) menos custo de aquisição — usa vlr_custo_produto
-- (confirmado com a farmácia; venda_itens tem outros dois campos de
-- custo — valor_total_custo e vlr_custo_aquisicao — que NÃO são esse).
-- nome_vendedor entra por último (não no meio) porque essa view usa
-- `create or replace` — Postgres só deixa ACRESCENTAR coluna no fim,
-- não realocar; ver supabase/migracao_frente2.sql pra aplicar isso no
-- projeto já existente sem precisar recriar a view do zero.
create or replace view vw_metricas_vendedor_diario as
select
  vd.data_emissao,
  vi.codigo_vendedor,
  count(distinct vd.id) as qtd_notas,
  sum(vi.valor_total_liquido) as faturamento_liquido,
  sum(vi.valor_total_bruto) as faturamento_bruto,
  sum(vi.vlr_desconto) as total_desconto,
  round(sum(vi.vlr_desconto) / nullif(sum(vi.valor_total_bruto),0) * 100, 2) as taxa_desconto_pct,
  sum(vi.valor_total_liquido * (vi.prc_comissao/100.0)) as comissao_estimada,
  round(sum(vi.valor_total_liquido) / nullif(count(distinct vd.id),0), 2) as ticket_medio,
  sum(vi.vlr_custo_produto) as total_custo,
  round((sum(vi.valor_total_liquido) - sum(vi.vlr_custo_produto)) / nullif(sum(vi.valor_total_liquido),0) * 100, 2) as margem_bruta_pct,
  vend.nome as nome_vendedor
from venda_itens vi
join vendas vd on vd.id = vi.venda_id
join vendedores vend on vend.codigo = vi.codigo_vendedor
group by vd.data_emissao, vi.codigo_vendedor, vend.nome;

-- Ranking diário de vendedores (por faturamento líquido). Propositalmente
-- SEM security_invoker (ver rls_policies.sql) — mesma família de
-- vw_produtos_promocao_clientes: a tela "Ranking" do app é gamificação,
-- todo vendedor precisa ver a linha de todo mundo, não só a própria.
-- Rodando como dono, bypassa a RLS de vendas/venda_itens de propósito;
-- só expõe faturamento_liquido/posicao (não margem, desconto, custo).
create or replace view vw_ranking_vendedores_dia as
select
  data_emissao,
  codigo_vendedor,
  faturamento_liquido,
  rank() over (partition by data_emissao order by faturamento_liquido desc) as posicao,
  nome_vendedor
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

-- Fornecedor e fator de compra (conversão de embalagem) mais recentes
-- de cada produto — usado pela Lista de compras pra sugerir "de quem
-- comprar" e arredondar a quantidade pra caixa fechada, sem precisar
-- de um cadastro manual de "fornecedor preferido por produto" (a API
-- não expõe isso; a compra mais recente é a melhor aproximação).
create view vw_produto_fornecedor_recente as
select distinct on (ci.codigo_produto)
  ci.codigo_produto,
  c.codigo_fornecedor,
  f.nome_fantasia as nome_fornecedor,
  ci.fator_compra,
  c.data_entrada
from compras_itens ci
join compras c on c.id = ci.compra_id
join fornecedores f on f.codigo = c.codigo_fornecedor
order by ci.codigo_produto, c.data_entrada desc;

-- Venda recente por produto (30 dias) — dá o giro e "dias sem venda"
-- usados por Campanhas/Compras/Precificação (lib/campanhas.ts,
-- lib/doseCerta.ts, lib/precificacao.ts). Só telas gestor-only
-- consomem isso, e a RLS de venda_itens já garante que gestor vê
-- tudo — não precisa bypassar RLS aqui (diferente de Ranking/Alertas,
-- que precisam que QUALQUER vendedor veja dado cross-vendedor).
create view vw_venda_recente_produto as
select
  vi.codigo_produto,
  coalesce(sum(vi.quantidade_produtos) filter (where v.data_emissao >= current_date - interval '30 days'), 0) as quantidade_vendida_30d,
  (current_date - max(v.data_emissao))::int as dias_sem_venda
from venda_itens vi
join vendas v on v.id = vi.venda_id
group by vi.codigo_produto;

-- vw_clientes_inatividade fica definida em rls_policies.sql, não aqui
-- — ela depende da tabela `profiles` (criada lá) pro próprio controle
-- de acesso embutido (vendedor só vê os clientes dele, gestor vê
-- todos). Rodar esse script sozinho, sem o rls_policies.sql em
-- seguida, deixa essa view faltando.

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
-- exige_receita/tipo_receita entram no fim (não junto de preco_atual)
-- pra manter create-or-replace válido — ver migracao_frente2.sql.
create or replace view vw_produtos_promocao_clientes as
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
  sum(vi.quantidade_produtos) as quantidade_total,
  p.exige_receita,
  p.tipo_receita
from produtos p
join venda_itens vi on vi.codigo_produto = p.codigo
join vendas v on v.id = vi.venda_id
join clientes c on c.codigo = v.codigo_cliente
where p.em_promocao = true
group by p.codigo, p.nome, p.preco_atual, p.preco_anterior, p.percentual_desconto, c.codigo, c.nome, c.fone,
  p.exige_receita, p.tipo_receita;

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

-- Comissão do mês (fechamento) — SÓ meta mensal (semana is null), a
-- régua de faixas_comissao não se aplica a semana/dia. margem_bruta_valor
-- é a margem bruta REAL do vendedor no mês inteiro (não proporcional ao
-- valor_realizado da meta — vendedor pode vender fora do que compõe a
-- meta, mas aqui usamos o mesmo período ano/mes por simplicidade e
-- porque é isso que a farmácia comissiona: o mês todo, não só o que
-- bateu meta). faixa_comissao é a de maior piso que o percentual
-- atingido alcança (100%→10%, 90%→8%, ... abaixo de 70%→3%, ver
-- faixas_comissao). security_invoker=true: respeita a RLS de `metas`
-- (via vw_metas_progresso) e de vendas/venda_itens.
create view vw_metas_comissao as
select
  mp.meta_id,
  mp.codigo_vendedor,
  mp.nome_vendedor,
  mp.ano,
  mp.mes,
  mp.valor_meta,
  mp.valor_realizado,
  round(mp.valor_realizado / nullif(mp.valor_meta, 0) * 100, 2) as percentual_atingido,
  coalesce(margem.margem_bruta_valor, 0) as margem_bruta_valor,
  faixa.percentual_comissao,
  round(coalesce(margem.margem_bruta_valor, 0) * faixa.percentual_comissao / 100, 2) as comissao_valor
from vw_metas_progresso mp
left join lateral (
  select sum(vi.valor_total_liquido) - sum(vi.vlr_custo_produto) as margem_bruta_valor
  from vendas v
  join venda_itens vi on vi.venda_id = v.id
  where v.codigo_vendedor = mp.codigo_vendedor
    and v.tipo_cancelamento is null
    and extract(year from v.data_emissao) = mp.ano
    and extract(month from v.data_emissao) = mp.mes
) margem on true
join lateral (
  select percentual_comissao
  from faixas_comissao
  where percentual_meta_min <= coalesce(round(mp.valor_realizado / nullif(mp.valor_meta, 0) * 100, 2), 0)
  order by percentual_meta_min desc
  limit 1
) faixa on true
where mp.semana is null;
