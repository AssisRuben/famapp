-- ============================================================
-- PROFILES — vincula um usuário do Supabase Auth a um vendedor
-- e define seu papel (vendedor vs gestor).
-- Preenchido manualmente (ou por processo administrativo) ao
-- criar cada usuário no Supabase Auth — não é self-signup.
-- ============================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  codigo_vendedor integer references vendedores(codigo),
  role text not null check (role in ('vendedor', 'gestor')),
  created_at timestamptz default now()
);

alter table profiles enable row level security;

create policy "profiles: usuario le o proprio perfil"
on profiles for select
using (id = auth.uid());

-- Sem policies de insert/update/delete para authenticated: a
-- gestão de profiles (vincular vendedor, definir papel) é feita
-- via service_role (que ignora RLS), não pelo app.

-- ============================================================
-- Clientes ativos vs inativos (sem compra nos últimos 60 dias), com o
-- vendedor da ÚLTIMA compra — é o que define "cliente do vendedor" na
-- aba Clientes do app (vendedor só vê os seus, gestor vê todos).
-- Definida aqui (não em schema.sql) porque depende de `profiles`.
--
-- Propositalmente SEM security_invoker (mesmo motivo de
-- vw_produtos_promocao_clientes lá embaixo): se rodasse como invoker,
-- a RLS de `vendas` (vendedor só vê as próprias) restringiria a
-- subquery da última venda ANTES do filtro de papel rodar, fazendo um
-- vendedor "roubar" a última compra de um cliente que na verdade foi
-- atendido por outro vendedor (mostraria uma última compra
-- desatualizada, não a real). Rodando como dono, calculamos a última
-- compra de verdade pra todo mundo e SÓ DEPOIS aplicamos o filtro de
-- papel no WHERE — o controle de acesso aqui é manual (checa
-- profiles/auth.uid()), não via RLS automática.
-- ============================================================
create view vw_clientes_inatividade as
select
  c.codigo,
  c.nome,
  c.fone as telefone,
  ultima_venda.data_emissao as ultima_compra,
  (current_date - ultima_venda.data_emissao) as dias_sem_comprar,
  case when ultima_venda.data_emissao < current_date - interval '60 days' then true else false end as inativo,
  ultima_venda.codigo_vendedor,
  vd.nome as nome_vendedor
from clientes c
left join lateral (
  select v.data_emissao, v.codigo_vendedor
  from vendas v
  where v.codigo_cliente = c.codigo
  order by v.data_emissao desc, v.id desc
  limit 1
) ultima_venda on true
left join vendedores vd on vd.codigo = ultima_venda.codigo_vendedor
where exists (
  select 1 from profiles p
  where p.id = auth.uid()
    and (p.role = 'gestor' or ultima_venda.codigo_vendedor = p.codigo_vendedor)
);

-- ============================================================
-- RLS nas tabelas de negócio
-- Regra geral: gestor vê tudo; vendedor vê só os próprios dados.
-- Nenhuma policy de insert/update/delete para authenticated —
-- essas tabelas só são escritas pelo coletor via service_role.
-- ============================================================

alter table vendedores enable row level security;

create policy "vendedores: gestor le tudo"
on vendedores for select
using (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
));

create policy "vendedores: vendedor le o proprio registro"
on vendedores for select
using (exists (
  select 1 from profiles p
  where p.id = auth.uid() and p.role = 'vendedor' and p.codigo_vendedor = vendedores.codigo
));

-- clientes: qualquer usuário autenticado com profile pode ler
-- (vendedor precisa consultar cliente na hora da venda/atendimento).
alter table clientes enable row level security;

create policy "clientes: usuarios autenticados leem"
on clientes for select
using (exists (
  select 1 from profiles p where p.id = auth.uid()
));

alter table vendas enable row level security;

create policy "vendas: gestor le tudo"
on vendas for select
using (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
));

create policy "vendas: vendedor le as proprias"
on vendas for select
using (exists (
  select 1 from profiles p
  where p.id = auth.uid() and p.role = 'vendedor' and p.codigo_vendedor = vendas.codigo_vendedor
));

alter table venda_itens enable row level security;

create policy "venda_itens: gestor le tudo"
on venda_itens for select
using (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
));

create policy "venda_itens: vendedor le os proprios"
on venda_itens for select
using (exists (
  select 1 from profiles p
  where p.id = auth.uid() and p.role = 'vendedor' and p.codigo_vendedor = venda_itens.codigo_vendedor
));

alter table vendas_vendedor_diario enable row level security;

create policy "vvd: gestor le tudo"
on vendas_vendedor_diario for select
using (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
));

create policy "vvd: vendedor le o proprio"
on vendas_vendedor_diario for select
using (exists (
  select 1 from profiles p
  where p.id = auth.uid() and p.role = 'vendedor' and p.codigo_vendedor = vendas_vendedor_diario.codigo_vendedor
));

-- produtos: curadoria manual (promoção / exige receita). Qualquer
-- autenticado lê; só gestor escreve (curadoria é responsabilidade
-- da farmácia, não do vendedor nem do coletor).
alter table produtos enable row level security;

create policy "produtos: usuarios autenticados leem"
on produtos for select
using (exists (
  select 1 from profiles p where p.id = auth.uid()
));

create policy "produtos: gestor insere"
on produtos for insert
with check (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
));

create policy "produtos: gestor atualiza"
on produtos for update
using (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
))
with check (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
));

create policy "produtos: gestor deleta"
on produtos for delete
using (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
));

-- venda_item_receitas: escrita pelo próprio app (diferente das outras
-- tabelas de negócio, que só o coletor/service_role escreve). Vendedor
-- só mexe nas receitas dos itens que ele mesmo vendeu; gestor, tudo.
alter table venda_item_receitas enable row level security;

create policy "receitas: select proprio ou gestor"
on venda_item_receitas for select
using (exists (
  select 1
  from profiles pr
  join venda_itens vi on vi.id = venda_item_receitas.venda_item_id
  join vendas v on v.id = vi.venda_id
  where pr.id = auth.uid()
    and (pr.role = 'gestor' or pr.codigo_vendedor = v.codigo_vendedor)
));

create policy "receitas: insert proprio ou gestor"
on venda_item_receitas for insert
with check (exists (
  select 1
  from profiles pr
  join venda_itens vi on vi.id = venda_item_receitas.venda_item_id
  join vendas v on v.id = vi.venda_id
  where pr.id = auth.uid()
    and (pr.role = 'gestor' or pr.codigo_vendedor = v.codigo_vendedor)
));

create policy "receitas: update proprio ou gestor"
on venda_item_receitas for update
using (exists (
  select 1
  from profiles pr
  join venda_itens vi on vi.id = venda_item_receitas.venda_item_id
  join vendas v on v.id = vi.venda_id
  where pr.id = auth.uid()
    and (pr.role = 'gestor' or pr.codigo_vendedor = v.codigo_vendedor)
))
with check (exists (
  select 1
  from profiles pr
  join venda_itens vi on vi.id = venda_item_receitas.venda_item_id
  join vendas v on v.id = vi.venda_id
  where pr.id = auth.uid()
    and (pr.role = 'gestor' or pr.codigo_vendedor = v.codigo_vendedor)
));

-- metas: cadastrada pelo gestor na tela "Metas". Vendedor só lê as
-- próprias (pra ver o progresso no Dashboard); só gestor escreve.
alter table metas enable row level security;

create policy "metas: select proprio ou gestor"
on metas for select
using (exists (
  select 1 from profiles p
  where p.id = auth.uid()
    and (p.role = 'gestor' or p.codigo_vendedor = metas.codigo_vendedor)
));

create policy "metas: gestor insere"
on metas for insert
with check (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
));

create policy "metas: gestor atualiza"
on metas for update
using (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
))
with check (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
));

create policy "metas: gestor deleta"
on metas for delete
using (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
));

-- produto_catalogo: mesmo padrão de vendedores/clientes/vendas — synced
-- pelo coletor (quando existir) via service_role. Nenhuma policy de
-- insert/update/delete para authenticated; leitura liberada pra
-- qualquer autenticado (é dado de catálogo, não sensível).
alter table produto_catalogo enable row level security;

create policy "produto_catalogo: usuarios autenticados leem"
on produto_catalogo for select
using (exists (
  select 1 from profiles p where p.id = auth.uid()
));

-- campanhas/campanha_produtos: só gestor mexe — é decisão de negócio
-- (margem/estoque/venda), vendedor não precisa ver rascunho de
-- campanha nem tem ação nenhuma aqui.
alter table campanhas enable row level security;
alter table campanha_produtos enable row level security;

create policy "campanhas: gestor tudo"
on campanhas for all
using (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
))
with check (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
));

create policy "campanha_produtos: gestor tudo"
on campanha_produtos for all
using (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
))
with check (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
));

-- sync_control: escrita continua exclusiva do coletor via service_role
-- (nenhuma policy de insert/update/delete para authenticated). Leitura
-- liberada pra qualquer autenticado — usada pelo app pra mostrar "dados
-- sincronizados pela última vez em..." no Dashboard. Não é dado sensível
-- (só nome da entidade + timestamp), então não precisa de filtro por
-- vendedor/gestor.
alter table sync_control enable row level security;

create policy "sync_control: usuarios autenticados leem"
on sync_control for select
using (exists (
  select 1 from profiles p where p.id = auth.uid()
));

-- ============================================================
-- VIEWS: por padrão, views no Postgres rodam com o privilégio do
-- dono (postgres), o que IGNORARIA a RLS das tabelas base. Forçar
-- security_invoker faz a view respeitar a RLS de quem está
-- consultando (o usuário logado no app), igual às tabelas.
-- ============================================================
alter view vw_desempenho_vendedor_diario set (security_invoker = true);
alter view vw_metricas_vendedor_diario set (security_invoker = true);
alter view vw_ranking_vendedores_dia set (security_invoker = true);
alter view vw_vendas_por_canal set (security_invoker = true);
alter view vw_vendas_receita_status set (security_invoker = true);
alter view vw_metas_progresso set (security_invoker = true);
-- vw_produtos_promocao_clientes e vw_clientes_inatividade ficam de
-- propósito SEM security_invoker (ver comentário de cada uma em
-- schema.sql) — não é esquecimento. As duas fazem o próprio controle
-- de acesso no WHERE (checando profiles/auth.uid()) em vez de confiar
-- na RLS automática das tabelas base.
