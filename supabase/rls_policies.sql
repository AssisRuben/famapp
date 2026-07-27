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

-- sync_control: uso interno do coletor. RLS habilitado sem
-- nenhuma policy = bloqueado por padrão para anon/authenticated;
-- só o service_role (que ignora RLS) acessa.
alter table sync_control enable row level security;

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
alter view vw_clientes_inatividade set (security_invoker = true);
