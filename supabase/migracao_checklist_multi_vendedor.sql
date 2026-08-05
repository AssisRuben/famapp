-- Migração: atividade de checklist agora pode ser atribuída a VÁRIOS
-- vendedores específicos (antes: um só, ou null pra "todos"). Idempotente.

create table if not exists atividade_checklist_vendedores (
  atividade_id bigint not null references atividades_checklist(id) on delete cascade,
  codigo_vendedor integer not null references vendedores(codigo),
  primary key (atividade_id, codigo_vendedor)
);

alter table atividade_checklist_vendedores enable row level security;

drop policy if exists "atividade_checklist_vendedores: autenticados leem" on atividade_checklist_vendedores;
create policy "atividade_checklist_vendedores: autenticados leem"
on atividade_checklist_vendedores for select
using (exists (
  select 1 from profiles p where p.id = auth.uid()
));

drop policy if exists "atividade_checklist_vendedores: gestor insere" on atividade_checklist_vendedores;
create policy "atividade_checklist_vendedores: gestor insere"
on atividade_checklist_vendedores for insert
with check (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
));

drop policy if exists "atividade_checklist_vendedores: gestor deleta" on atividade_checklist_vendedores;
create policy "atividade_checklist_vendedores: gestor deleta"
on atividade_checklist_vendedores for delete
using (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
));

-- migra os dados existentes: atividade com um único codigo_vendedor
-- vira uma linha na tabela nova; codigo_vendedor null (= "todos") não
-- precisa de linha nenhuma (ausência de linha já significa "todos").
insert into atividade_checklist_vendedores (atividade_id, codigo_vendedor)
select id, codigo_vendedor from atividades_checklist where codigo_vendedor is not null
on conflict do nothing;

alter table atividades_checklist drop column if exists codigo_vendedor;
