-- [13/08/2026] "Vendas Complementares" — vendedor marca manualmente
-- quais itens da própria venda do dia foram venda complementar (upsell,
-- "e mais uma coisa"). DIFERENTE de "Venda Adicional" (já existente):
-- aquela é automática (gestor escolhe produtos de uma campanha, sistema
-- detecta sozinho quem vendeu) — aqui é o vendedor quem decide e marca,
-- item por item, sem produto pré-definido.
--
-- venda_item_complementar: existência da linha = marcado. Só um
-- registro por item (unique em venda_item_id) — marcar de novo não
-- duplica, desmarcar apaga a linha. codigo_vendedor gravado direto
-- (não só via join em venda_itens) pra RLS não precisar de subquery
-- extra, mesmo padrão de checklist_respostas.
create table venda_item_complementar (
  id bigserial primary key,
  venda_item_id bigint not null unique references venda_itens(id) on delete cascade,
  codigo_vendedor integer not null references vendedores(codigo),
  marcado_por uuid references auth.users(id),
  marcado_em timestamptz not null default now()
);

create index idx_venda_item_complementar_vendedor on venda_item_complementar (codigo_vendedor);

alter table venda_item_complementar enable row level security;

-- Select: qualquer autenticado lê (mesmo critério simples de
-- campanhas_complementares) — a marcação já é exposta pra todo mundo
-- de qualquer forma via vw_venda_complementar_marcada (ranking), então
-- restringir aqui só criava um buraco: um policy com "role = 'gestor'
-- or codigo_vendedor = ..." consistentemente voltava vazio pro gestor
-- numa consulta direta na tabela (RLS em subquery aninhada não se
-- comportou como esperado aqui) — a marcação sumia da tela mesmo já
-- salva no banco (achado 18/08/2026).
create policy "venda_item_complementar: autenticados leem"
on venda_item_complementar for select
using (exists (
  select 1 from profiles p where p.id = auth.uid()
));

-- Insert/delete: vendedor só no próprio (marca/desmarca a própria
-- venda do dia); gestor pode em qualquer vendedor (pedido explícito do
-- usuário — "o gestor também tem a opção de marcar e desmarcar").
create policy "venda_item_complementar: vendedor marca o proprio ou gestor marca qualquer"
on venda_item_complementar for insert
with check (exists (
  select 1 from profiles p
  where p.id = auth.uid()
    and (
      p.role = 'gestor'
      or (p.role = 'vendedor' and p.codigo_vendedor = venda_item_complementar.codigo_vendedor)
    )
));

create policy "venda_item_complementar: vendedor desmarca o proprio ou gestor desmarca qualquer"
on venda_item_complementar for delete
using (exists (
  select 1 from profiles p
  where p.id = auth.uid()
    and (
      p.role = 'gestor'
      or (p.role = 'vendedor' and p.codigo_vendedor = venda_item_complementar.codigo_vendedor)
    )
));

-- campanhas_complementares: config do ranking/premiação (gestor decide
-- período, mesmo padrão de campanhas_venda_adicional). valor_minimo é
-- em REAIS (valor mínimo vendido em complementares pra concorrer),
-- diferente de minimo_para_concorrer de venda_adicional que é
-- quantidade — aqui não faz sentido quantidade, é sempre soma de valor.
create table campanhas_complementares (
  id bigserial primary key,
  data_inicio date not null,
  data_fim date not null,
  valor_minimo numeric(12,2) check (valor_minimo > 0),
  -- Piso de QUANTIDADE de itens marcados no período, independente do
  -- piso de valor acima — quem tem os dois configurados precisa bater
  -- ambos pra concorrer (18/08/2026).
  quantidade_minima integer check (quantidade_minima > 0),
  premiacao_ranking jsonb not null,
  criado_por uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table campanhas_complementares enable row level security;

-- Mesmo critério de campanhas_venda_adicional: todo mundo lê (vendedor
-- precisa ver o próprio ranking/prêmio), só gestor escreve.
create policy "campanhas_complementares: autenticados leem"
on campanhas_complementares for select
using (exists (
  select 1 from profiles p where p.id = auth.uid()
));

create policy "campanhas_complementares: gestor insere"
on campanhas_complementares for insert
with check (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
));

create policy "campanhas_complementares: gestor atualiza"
on campanhas_complementares for update
using (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
))
with check (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
));

create policy "campanhas_complementares: gestor apaga"
on campanhas_complementares for delete
using (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
));

-- Vendas marcadas, já com valor e vendedor — matéria-prima do ranking
-- (cálculo em si é feito no app, mesmo padrão de vw_venda_adicional_vendas).
-- Propositalmente SEM security_invoker (mesma família de
-- vw_ranking_vendedores_dia): todo vendedor precisa ver a linha de
-- TODOS pra saber sua posição no ranking, não só a própria — com
-- security_invoker=true a RLS restritiva de venda_item_complementar
-- (vendedor só vê o próprio) cortaria o ranking pela metade.
create view vw_venda_complementar_marcada as
select
  vic.venda_item_id,
  vic.codigo_vendedor,
  vd.nome as nome_vendedor,
  v.data_emissao,
  vi.valor_total_liquido as valor,
  vi.codigo_produto
from venda_item_complementar vic
join venda_itens vi on vi.id = vic.venda_item_id
join vendas v on v.id = vi.venda_id
left join vendedores vd on vd.codigo = vic.codigo_vendedor;

alter view vw_venda_complementar_marcada set (security_invoker = false);

-- Se esse arquivo já tinha sido rodado ANTES de 18/08/2026 (sem a
-- coluna quantidade_minima acima), rode só este ALTER — é seguro
-- rodar de novo, não quebra nada se a coluna já existir.
alter table campanhas_complementares
  add column if not exists quantidade_minima integer check (quantidade_minima > 0);

-- Mesmo caso pra vw_venda_complementar_marcada: se já rodou antes de
-- 18/08/2026 (sem codigo_produto, usado no "ver produtos" do ranking),
-- rode só este CREATE OR REPLACE — seguro rodar de novo.
create or replace view vw_venda_complementar_marcada as
select
  vic.venda_item_id,
  vic.codigo_vendedor,
  vd.nome as nome_vendedor,
  v.data_emissao,
  vi.valor_total_liquido as valor,
  vi.codigo_produto
from venda_item_complementar vic
join venda_itens vi on vi.id = vic.venda_item_id
join vendas v on v.id = vi.venda_id
left join vendedores vd on vd.codigo = vic.codigo_vendedor;

alter view vw_venda_complementar_marcada set (security_invoker = false);

-- A marcação estava sumindo da tela mesmo depois de confirmada salva
-- no banco: a policy antiga de SELECT ("role = 'gestor' or
-- codigo_vendedor = ...") não estava liberando leitura pro gestor numa
-- consulta direta na tabela. Rode este bloco pra trocar pela policy
-- simples (mesmo padrão de campanhas_complementares) — seguro rodar
-- de novo, os DROP têm IF EXISTS (18/08/2026).
drop policy if exists "venda_item_complementar: select proprio ou gestor" on venda_item_complementar;
drop policy if exists "venda_item_complementar: autenticados leem" on venda_item_complementar;

create policy "venda_item_complementar: autenticados leem"
on venda_item_complementar for select
using (exists (
  select 1 from profiles p where p.id = auth.uid()
));
