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
-- Usado pra gerar ação de RESGATE de cliente (mensagem de reativação,
-- ver ClientesScreen.tsx) — por isso cliente que nunca comprou nada
-- não entra aqui (não tem o que "resgatar"): `join lateral` normal em
-- vez de `left join lateral` derruba da view quem não tem nenhuma
-- linha em `vendas`, ao contrário de aparecer com `ultima_compra null`
-- e `inativo false` (que escondia esses clientes dentro do bucket
-- "ativo" sem ser um deles de verdade — achado em 31/07/2026 revisando
-- o tile "Clientes inativos" do Painel).
--
-- Propositalmente SEM security_invoker (mesmo motivo de
-- vw_produtos_promocao_clientes lá embaixo): se rodasse como invoker,
-- a RLS de `vendas` (agora liberada pra todo autenticado — ver
-- migracao_acesso_vendedor.sql) não teria mais esse problema, mas
-- rodar como dono continua correto/mais simples de raciocinar. O
-- controle de acesso aqui é manual (checa profiles/auth.uid()), não
-- via RLS automática.
--
-- [01/08/2026] Vendedor vê todo cliente agora, não só os próprios —
-- "resultado dos outros" (mesma decisão de vendas/metas, ver
-- migracao_acesso_vendedor.sql). codigo_vendedor/nome_vendedor da
-- última compra continuam na view (útil pra saber quem atendeu),
-- só não filtra mais quem pode VER a linha.
-- ============================================================
create or replace view vw_clientes_inatividade as
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
join lateral (
  select v.data_emissao, v.codigo_vendedor
  from vendas v
  where v.codigo_cliente = c.codigo
  order by v.data_emissao desc, v.id desc
  limit 1
) ultima_venda on true
left join vendedores vd on vd.codigo = ultima_venda.codigo_vendedor
where exists (
  select 1 from profiles p where p.id = auth.uid()
)
-- Cadastro morto (última compra há 3000+ dias, ~8 anos) não entra na
-- lista de resgate nem no tile "Clientes inativos" — não tem resgate
-- razoável depois disso, só polui a lista (03/08/2026). Filtro, não
-- DELETE: nenhum dado é perdido, cliente/venda continuam intactos no
-- banco, só somem dessa consulta específica.
and (current_date - ultima_venda.data_emissao) <= 3000;

-- ============================================================
-- RLS nas tabelas de negócio
-- Regra geral: gestor vê tudo; vendedor vê só os próprios dados.
-- Nenhuma policy de insert/update/delete para authenticated —
-- essas tabelas só são escritas pelo coletor via service_role.
-- ============================================================

alter table vendedores enable row level security;

-- Vendedor vê o cadastro de todo mundo (não só o próprio) — decisão de
-- produto: o Painel deve mostrar "venda geral e resultado dos outros"
-- pra qualquer vendedor, igual ao gestor (01/08/2026). Views com
-- security_invoker=true que fazem join com vendedores (métricas
-- diário/semanal/mensal) dependem disso pra trazer nome_vendedor de
-- todo mundo, não só do usuário logado.
create policy "vendedores: usuarios autenticados leem"
on vendedores for select
using (exists (
  select 1 from profiles p where p.id = auth.uid()
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

-- Mesma decisão de vendedores acima: vendedor lê vendas de todo mundo,
-- não só as próprias.
create policy "vendas: usuarios autenticados leem"
on vendas for select
using (exists (
  select 1 from profiles p where p.id = auth.uid()
));

alter table venda_itens enable row level security;

create policy "venda_itens: usuarios autenticados leem"
on venda_itens for select
using (exists (
  select 1 from profiles p where p.id = auth.uid()
));

alter table vendas_vendedor_diario enable row level security;

create policy "vvd: usuarios autenticados leem"
on vendas_vendedor_diario for select
using (exists (
  select 1 from profiles p where p.id = auth.uid()
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
-- tabelas de negócio, que só o coletor/service_role escreve).
alter table venda_item_receitas enable row level security;

-- [02/08/2026] Leitura E escrita liberadas pra qualquer autenticado —
-- mesma decisão já tomada pra vendas/clientes (todo mundo vê/mexe no
-- resultado de todos). Antes insert/update exigiam ser o vendedor
-- dono da venda (ou gestor), mas isso não faz sentido real: um
-- cliente pode voltar e ser atendido por outro vendedor/farmacêutico
-- de plantão, que precisa poder anexar a receita mesmo não tendo
-- feito a venda original.
create policy "receitas: usuarios autenticados leem"
on venda_item_receitas for select
using (exists (
  select 1 from profiles p where p.id = auth.uid()
));

create policy "receitas: usuarios autenticados inserem"
on venda_item_receitas for insert
with check (exists (
  select 1 from profiles p where p.id = auth.uid()
));

create policy "receitas: usuarios autenticados atualizam"
on venda_item_receitas for update
using (exists (
  select 1 from profiles p where p.id = auth.uid()
))
with check (exists (
  select 1 from profiles p where p.id = auth.uid()
));

-- metas: cadastrada pelo gestor na tela "Metas". Vendedor só lê as
-- próprias (pra ver o progresso no Dashboard); só gestor escreve.
-- [01/08/2026] Leitura liberada pra todo mundo ver o ranking completo
-- de metas de todo mundo, não só a própria — mesma decisão de
-- vendas/venda_itens acima. Escrita continua gestor-only.
alter table metas enable row level security;

create policy "metas: usuarios autenticados leem"
on metas for select
using (exists (
  select 1 from profiles p where p.id = auth.uid()
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

-- fornecedores/compras/compras_itens: mesmo padrão de produto_catalogo
-- — synced pelo coletor via service_role, leitura liberada (não é dado
-- mais sensível que custo_medio, que já é público pra autenticado).
alter table fornecedores enable row level security;
alter table compras enable row level security;
alter table compras_itens enable row level security;

create policy "fornecedores: usuarios autenticados leem"
on fornecedores for select
using (exists (
  select 1 from profiles p where p.id = auth.uid()
));

create policy "compras: usuarios autenticados leem"
on compras for select
using (exists (
  select 1 from profiles p where p.id = auth.uid()
));

create policy "compras_itens: usuarios autenticados leem"
on compras_itens for select
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

-- campanhas_venda_adicional/produtos: DIFERENTE de campanhas acima —
-- aqui todo vendedor precisa LER (card em Alertas, pra todo mundo),
-- só o gestor escreve (aba "Venda adicional").
alter table campanhas_venda_adicional enable row level security;
alter table campanha_venda_adicional_produtos enable row level security;

create policy "campanhas_venda_adicional: autenticados leem"
on campanhas_venda_adicional for select
using (exists (
  select 1 from profiles p where p.id = auth.uid()
));

create policy "campanhas_venda_adicional: gestor insere"
on campanhas_venda_adicional for insert
with check (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
));

create policy "campanhas_venda_adicional: gestor atualiza"
on campanhas_venda_adicional for update
using (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
))
with check (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
));

create policy "campanhas_venda_adicional: gestor apaga"
on campanhas_venda_adicional for delete
using (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
));

create policy "campanha_venda_adicional_produtos: autenticados leem"
on campanha_venda_adicional_produtos for select
using (exists (
  select 1 from profiles p where p.id = auth.uid()
));

create policy "campanha_venda_adicional_produtos: gestor insere"
on campanha_venda_adicional_produtos for insert
with check (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
));

create policy "campanha_venda_adicional_produtos: gestor apaga"
on campanha_venda_adicional_produtos for delete
using (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
));

-- produtos_em_falta: lista compartilhada, não é log de auditoria — CRUD
-- aberto pra qualquer autenticado, inclusive editar/apagar registro de
-- outra pessoa (o objetivo é o time manter a lista do mês limpa).
alter table produtos_em_falta enable row level security;

create policy "produtos_em_falta: autenticados leem"
on produtos_em_falta for select
using (exists (
  select 1 from profiles p where p.id = auth.uid()
));

create policy "produtos_em_falta: autenticados inserem"
on produtos_em_falta for insert
with check (exists (
  select 1 from profiles p where p.id = auth.uid()
));

create policy "produtos_em_falta: autenticados atualizam"
on produtos_em_falta for update
using (exists (
  select 1 from profiles p where p.id = auth.uid()
))
with check (exists (
  select 1 from profiles p where p.id = auth.uid()
));

create policy "produtos_em_falta: autenticados apagam"
on produtos_em_falta for delete
using (exists (
  select 1 from profiles p where p.id = auth.uid()
));

-- vw_produtos_em_falta (03/08/2026) — resolve quem registrou cada
-- falta, mas só devolve o nome pra quem está logado como GESTOR;
-- vendedor recebe null nessa coluna, mesmo lendo a mesma view (pedido
-- explícito: "apenas na aba do gestor"). Precisa ser SEM
-- security_invoker de propósito — profiles só deixa cada um ler o
-- PRÓPRIO perfil (RLS restritiva), então rodando como invoker o
-- vendedor não conseguiria nem resolver o nome de quem quer que seja;
-- a view roda com privilégio de dono e decide sozinha o que devolver,
-- checando auth.uid() por dentro (mesmo padrão de
-- vw_receita_identificacao_comprador acima).
create view vw_produtos_em_falta as
select
  pef.id,
  pef.nome_produto,
  pef.codigo_produto,
  pef.data,
  case
    when exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor')
    then coalesce(vd.nome, 'Gestor(a) da Farmácia')
    else null
  end as nome_registrado_por
from produtos_em_falta pef
left join profiles perfil_registro on perfil_registro.id = pef.registrado_por
left join vendedores vd on vd.codigo = perfil_registro.codigo_vendedor;

-- atividades_checklist: cadastrada pelo gestor (aba "Metas" do app).
-- Vendedor só lê as ATIVAS (é o que aparece no checklist diário dele);
-- gestor lê todas (incl. inativas, pra gerenciar). Só gestor escreve.
alter table atividades_checklist enable row level security;

create policy "atividades_checklist: gestor le tudo"
on atividades_checklist for select
using (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
));

create policy "atividades_checklist: vendedor le as ativas"
on atividades_checklist for select
using (
  ativo = true
  and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'vendedor')
);

create policy "atividades_checklist: gestor insere"
on atividades_checklist for insert
with check (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
));

create policy "atividades_checklist: gestor atualiza"
on atividades_checklist for update
using (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
))
with check (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
));

create policy "atividades_checklist: gestor deleta"
on atividades_checklist for delete
using (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
));

-- checklist_respostas: marcação diária escrita pelo PRÓPRIO vendedor
-- (não pelo coletor, igual venda_item_receitas). Vendedor só mexe nas
-- próprias respostas; gestor lê tudo (acompanhamento) mas não edita em
-- nome do vendedor.
alter table checklist_respostas enable row level security;

create policy "checklist_respostas: select proprio ou gestor"
on checklist_respostas for select
using (exists (
  select 1 from profiles p
  where p.id = auth.uid()
    and (p.role = 'gestor' or p.codigo_vendedor = checklist_respostas.codigo_vendedor)
));

create policy "checklist_respostas: vendedor insere o proprio"
on checklist_respostas for insert
with check (exists (
  select 1 from profiles p
  where p.id = auth.uid()
    and p.role = 'vendedor'
    and p.codigo_vendedor = checklist_respostas.codigo_vendedor
));

create policy "checklist_respostas: vendedor atualiza o proprio"
on checklist_respostas for update
using (exists (
  select 1 from profiles p
  where p.id = auth.uid()
    and p.role = 'vendedor'
    and p.codigo_vendedor = checklist_respostas.codigo_vendedor
))
with check (exists (
  select 1 from profiles p
  where p.id = auth.uid()
    and p.role = 'vendedor'
    and p.codigo_vendedor = checklist_respostas.codigo_vendedor
));

-- faixas_comissao: régua de comissão. Qualquer autenticado lê (vendedor
-- precisa ver em qual faixa está); só gestor edita as faixas.
alter table faixas_comissao enable row level security;

create policy "faixas_comissao: usuarios autenticados leem"
on faixas_comissao for select
using (exists (
  select 1 from profiles p where p.id = auth.uid()
));

create policy "faixas_comissao: gestor insere"
on faixas_comissao for insert
with check (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
));

create policy "faixas_comissao: gestor atualiza"
on faixas_comissao for update
using (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
))
with check (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
));

create policy "faixas_comissao: gestor deleta"
on faixas_comissao for delete
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

-- contatos_clientes: escrito pelo próprio app quando o vendedor clica
-- Ligar/WhatsApp (não pelo coletor). Igual a venda_item_receitas —
-- qualquer autenticado lê e insere (qualquer vendedor pode contatar
-- qualquer cliente, mesma decisão de escopo do resto do app). Sem
-- policy de update/delete: é um log de tentativa de contato, não deve
-- ser editado depois de criado.
alter table contatos_clientes enable row level security;

create policy "contatos_clientes: usuarios autenticados leem"
on contatos_clientes for select
using (exists (
  select 1 from profiles p where p.id = auth.uid()
));

create policy "contatos_clientes: usuarios autenticados inserem"
on contatos_clientes for insert
with check (exists (
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
alter view vw_vendas_por_canal set (security_invoker = true);
alter view vw_vendas_receita_status set (security_invoker = true);
alter view vw_vendas_antimicrobiano_recente set (security_invoker = true);
alter view vw_venda_adicional_vendas set (security_invoker = true);
alter view vw_receita_identificacao_comprador set (security_invoker = true);
alter view vw_vendas_sem_identificacao_comprador set (security_invoker = true);
alter view vw_metas_progresso set (security_invoker = true);
alter view vw_metas_comissao set (security_invoker = true);
alter view vw_produto_fornecedor_recente set (security_invoker = true);
alter view vw_venda_recente_produto set (security_invoker = true);
alter view vw_metricas_vendedor_mensal set (security_invoker = true);
alter view vw_desempenho_vendedor_mensal set (security_invoker = true);
alter view vw_metricas_vendedor_semanal set (security_invoker = true);
alter view vw_desempenho_vendedor_semanal set (security_invoker = true);
alter view vw_clientes_por_vendedor set (security_invoker = true);
alter view vw_historico_compras_cliente set (security_invoker = true);
alter view vw_clientes_produtos_vendedor set (security_invoker = true);
alter view vw_clientes_produtos set (security_invoker = true);
-- vw_produtos_promocao_clientes, vw_clientes_inatividade e
-- vw_ranking_vendedores_dia ficam de propósito SEM security_invoker (ver
-- comentário de cada uma em schema.sql) — não é esquecimento. Gap
-- corrigido nesta rodada: vw_ranking_vendedores_dia tinha
-- security_invoker=true aqui antes, o que fazia um vendedor real só ver
-- a própria linha do ranking (sempre em 1º, sozinho), diferente da tela
-- "Ranking" do app, que mostra todo mundo de propósito (gamificação).
-- As duas primeiras fazem o próprio controle de acesso no WHERE
-- (checando profiles/auth.uid()) em vez de confiar na RLS automática das
-- tabelas base; a de ranking não precisa nem disso, roda liberada.
