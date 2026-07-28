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
alter view vw_clientes_inatividade set (security_invoker = true);
alter view vw_vendas_receita_status set (security_invoker = true);
alter view vw_metas_progresso set (security_invoker = true);
-- vw_produtos_promocao_clientes fica de propósito SEM security_invoker
-- (ver comentário dela em schema.sql) — não é esquecimento.
