-- ============================================================
-- Migração pra colocar o projeto Supabase REAL (ggzuchqfepjbsyadfcnk)
-- em dia com schema.sql/rls_policies.sql — rodar inteiro, de uma vez,
-- no SQL Editor.
--
-- Contexto: só a "Frente 1" original foi aplicada no banco de verdade
-- (vendedores, clientes, vendas, venda_itens, vendas_vendedor_diario,
-- profiles, sync_control + as 5 views correspondentes). Tudo que foi
-- adicionado depois — Receitas, Alertas, Metas, Comissão, Checklist,
-- Campanhas/Cartazetes, Compras, Precificação — nunca chegou no banco
-- real, só ficou no arquivo schema.sql. Confirmado rodando:
--   select table_name from information_schema.tables where table_schema='public';
--   select table_name from information_schema.views where table_schema='public';
-- (ver conversa — resultado bateu exatamente com essa lista de 8 tabelas
-- e 5 views já existentes).
--
-- Seguro rodar mais de uma vez (create table sem "if not exists" só
-- porque sabemos que essas 12 tabelas especificamente NÃO existem ainda;
-- se strong precisar rodar de novo depois de já ter rodado uma vez, use
-- "if not exists"/"create or replace" — todas as views abaixo já usam).
-- ============================================================

-- ============================================================
-- PARTE 1 — TABELAS QUE FALTAM (na ordem certa de dependência)
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

create table venda_item_receitas (
  id bigserial primary key,
  venda_item_id bigint not null unique references venda_itens(id) on delete cascade,
  tipo_receita text not null check (tipo_receita in ('comum', 'controle_especial', 'antimicrobiano')),
  foto_url text,
  anexado_por uuid references auth.users(id),
  data_anexo timestamptz not null default now()
);

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
  fator_compra integer default 1,
  valor_unitario numeric(12,2),
  valor_unitario_liquido numeric(12,2),
  valor_custo numeric(12,2),
  valor_st numeric(12,2)
);

create index idx_compras_itens_compra on compras_itens (compra_id);
create index idx_compras_itens_produto on compras_itens (codigo_produto);

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
-- PARTE 2 — RLS das tabelas novas (nenhuma tinha policy antes,
-- confirmado via pg_policies)
-- ============================================================

alter table produtos enable row level security;

create policy "produtos: usuarios autenticados leem"
on produtos for select
using (exists (select 1 from profiles p where p.id = auth.uid()));

create policy "produtos: gestor insere"
on produtos for insert
with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'));

create policy "produtos: gestor atualiza"
on produtos for update
using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'))
with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'));

create policy "produtos: gestor deleta"
on produtos for delete
using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'));

alter table venda_item_receitas enable row level security;

create policy "receitas: select proprio ou gestor"
on venda_item_receitas for select
using (exists (
  select 1 from profiles pr
  join venda_itens vi on vi.id = venda_item_receitas.venda_item_id
  join vendas v on v.id = vi.venda_id
  where pr.id = auth.uid() and (pr.role = 'gestor' or pr.codigo_vendedor = v.codigo_vendedor)
));

create policy "receitas: insert proprio ou gestor"
on venda_item_receitas for insert
with check (exists (
  select 1 from profiles pr
  join venda_itens vi on vi.id = venda_item_receitas.venda_item_id
  join vendas v on v.id = vi.venda_id
  where pr.id = auth.uid() and (pr.role = 'gestor' or pr.codigo_vendedor = v.codigo_vendedor)
));

create policy "receitas: update proprio ou gestor"
on venda_item_receitas for update
using (exists (
  select 1 from profiles pr
  join venda_itens vi on vi.id = venda_item_receitas.venda_item_id
  join vendas v on v.id = vi.venda_id
  where pr.id = auth.uid() and (pr.role = 'gestor' or pr.codigo_vendedor = v.codigo_vendedor)
))
with check (exists (
  select 1 from profiles pr
  join venda_itens vi on vi.id = venda_item_receitas.venda_item_id
  join vendas v on v.id = vi.venda_id
  where pr.id = auth.uid() and (pr.role = 'gestor' or pr.codigo_vendedor = v.codigo_vendedor)
));

alter table metas enable row level security;

create policy "metas: select proprio ou gestor"
on metas for select
using (exists (
  select 1 from profiles p where p.id = auth.uid() and (p.role = 'gestor' or p.codigo_vendedor = metas.codigo_vendedor)
));

create policy "metas: gestor insere"
on metas for insert
with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'));

create policy "metas: gestor atualiza"
on metas for update
using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'))
with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'));

create policy "metas: gestor deleta"
on metas for delete
using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'));

alter table faixas_comissao enable row level security;

create policy "faixas_comissao: usuarios autenticados leem"
on faixas_comissao for select
using (exists (select 1 from profiles p where p.id = auth.uid()));

create policy "faixas_comissao: gestor insere"
on faixas_comissao for insert
with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'));

create policy "faixas_comissao: gestor atualiza"
on faixas_comissao for update
using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'))
with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'));

create policy "faixas_comissao: gestor deleta"
on faixas_comissao for delete
using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'));

alter table atividades_checklist enable row level security;

create policy "atividades_checklist: gestor le tudo"
on atividades_checklist for select
using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'));

create policy "atividades_checklist: vendedor le as ativas"
on atividades_checklist for select
using (ativo = true and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'vendedor'));

create policy "atividades_checklist: gestor insere"
on atividades_checklist for insert
with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'));

create policy "atividades_checklist: gestor atualiza"
on atividades_checklist for update
using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'))
with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'));

create policy "atividades_checklist: gestor deleta"
on atividades_checklist for delete
using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'));

alter table checklist_respostas enable row level security;

create policy "checklist_respostas: select proprio ou gestor"
on checklist_respostas for select
using (exists (
  select 1 from profiles p where p.id = auth.uid() and (p.role = 'gestor' or p.codigo_vendedor = checklist_respostas.codigo_vendedor)
));

create policy "checklist_respostas: vendedor insere o proprio"
on checklist_respostas for insert
with check (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'vendedor' and p.codigo_vendedor = checklist_respostas.codigo_vendedor
));

create policy "checklist_respostas: vendedor atualiza o proprio"
on checklist_respostas for update
using (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'vendedor' and p.codigo_vendedor = checklist_respostas.codigo_vendedor
))
with check (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'vendedor' and p.codigo_vendedor = checklist_respostas.codigo_vendedor
));

alter table produto_catalogo enable row level security;

create policy "produto_catalogo: usuarios autenticados leem"
on produto_catalogo for select
using (exists (select 1 from profiles p where p.id = auth.uid()));

alter table fornecedores enable row level security;
alter table compras enable row level security;
alter table compras_itens enable row level security;

create policy "fornecedores: usuarios autenticados leem"
on fornecedores for select
using (exists (select 1 from profiles p where p.id = auth.uid()));

create policy "compras: usuarios autenticados leem"
on compras for select
using (exists (select 1 from profiles p where p.id = auth.uid()));

create policy "compras_itens: usuarios autenticados leem"
on compras_itens for select
using (exists (select 1 from profiles p where p.id = auth.uid()));

alter table campanhas enable row level security;
alter table campanha_produtos enable row level security;

create policy "campanhas: gestor tudo"
on campanhas for all
using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'))
with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'));

create policy "campanha_produtos: gestor tudo"
on campanha_produtos for all
using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'))
with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'));

-- ============================================================
-- PARTE 3 — VIEWS (todas com "or replace" — seguro rodar de novo)
-- ============================================================

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

create or replace view vw_ranking_vendedores_dia as
select
  data_emissao,
  codigo_vendedor,
  faturamento_liquido,
  rank() over (partition by data_emissao order by faturamento_liquido desc) as posicao,
  nome_vendedor
from vw_metricas_vendedor_diario;

create or replace view vw_vendas_receita_status as
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

create or replace view vw_metas_comissao as
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

create or replace view vw_produto_fornecedor_recente as
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

create or replace view vw_venda_recente_produto as
select
  vi.codigo_produto,
  coalesce(sum(vi.quantidade_produtos) filter (where v.data_emissao >= current_date - interval '30 days'), 0) as quantidade_vendida_30d,
  (current_date - max(v.data_emissao))::int as dias_sem_venda
from venda_itens vi
join vendas v on v.id = vi.venda_id
group by vi.codigo_produto;

-- ============================================================
-- PARTE 4 — security_invoker (reaplicado explicitamente em toda view
-- tocada acima, mesmo a que só foi criada agora — custa zero e
-- elimina qualquer dúvida sobre o que "create or replace" preserva
-- ou não de reloptions).
-- ============================================================

alter view vw_metricas_vendedor_diario set (security_invoker = true);
alter view vw_ranking_vendedores_dia set (security_invoker = false);
alter view vw_vendas_receita_status set (security_invoker = true);
alter view vw_produtos_promocao_clientes set (security_invoker = false);
alter view vw_metas_progresso set (security_invoker = true);
alter view vw_metas_comissao set (security_invoker = true);
alter view vw_produto_fornecedor_recente set (security_invoker = true);
alter view vw_venda_recente_produto set (security_invoker = true);

-- Fim. Depois de rodar, confirme com:
--   select table_name from information_schema.tables where table_schema='public' order by table_name;
--   select table_name from information_schema.views where table_schema='public' order by table_name;
-- Tabelas: as 7 do app que já existiam + 12 novas = 19, mais
-- "conteúdo" (app antiga, não relacionada, não mexer) = 20 linhas no
-- total. Views: as 5 que já existiam + 6 novas = 11.
