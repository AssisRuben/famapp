-- Migração: nova aba "Pendências" — vendedor registra produto(s)
-- separado(s)/reservado(s) pra um cliente buscar depois, com foto,
-- data automática e nome do cliente. "Dar baixa" marca resolvida
-- (não apaga, mantém histórico). Idempotente.

create table if not exists pendencias (
  id bigserial primary key,
  nome_cliente text not null,
  produtos text not null,
  foto_url text,
  data date not null default current_date,
  registrado_por uuid references auth.users(id),
  baixada boolean not null default false,
  baixada_em timestamptz,
  baixada_por uuid references auth.users(id),
  criado_em timestamptz not null default now()
);

create index if not exists idx_pendencias_baixada on pendencias (baixada);

alter table pendencias enable row level security;

drop policy if exists "pendencias: autenticados leem" on pendencias;
create policy "pendencias: autenticados leem"
on pendencias for select
using (exists (
  select 1 from profiles p where p.id = auth.uid()
));

drop policy if exists "pendencias: autenticados inserem" on pendencias;
create policy "pendencias: autenticados inserem"
on pendencias for insert
with check (exists (
  select 1 from profiles p where p.id = auth.uid()
));

drop policy if exists "pendencias: autenticados atualizam" on pendencias;
create policy "pendencias: autenticados atualizam"
on pendencias for update
using (exists (
  select 1 from profiles p where p.id = auth.uid()
))
with check (exists (
  select 1 from profiles p where p.id = auth.uid()
));

create or replace view vw_pendencias as
select
  p.id,
  p.nome_cliente,
  p.produtos,
  p.foto_url,
  p.data,
  p.baixada,
  p.baixada_em,
  coalesce(vd.nome, 'Gestor(a) da Farmácia') as nome_registrado_por
from pendencias p
left join profiles perfil_registro on perfil_registro.id = p.registrado_por
left join vendedores vd on vd.codigo = perfil_registro.codigo_vendedor;

insert into storage.buckets (id, name, public)
values ('pendencias', 'pendencias', false)
on conflict (id) do nothing;

drop policy if exists "pendencias storage: usuarios autenticados leem" on storage.objects;
create policy "pendencias storage: usuarios autenticados leem"
on storage.objects for select
using (
  bucket_id = 'pendencias'
  and exists (select 1 from profiles p where p.id = auth.uid())
);

drop policy if exists "pendencias storage: usuarios autenticados inserem" on storage.objects;
create policy "pendencias storage: usuarios autenticados inserem"
on storage.objects for insert
with check (
  bucket_id = 'pendencias'
  and exists (select 1 from profiles p where p.id = auth.uid())
);

drop policy if exists "pendencias storage: usuarios autenticados atualizam" on storage.objects;
create policy "pendencias storage: usuarios autenticados atualizam"
on storage.objects for update
using (
  bucket_id = 'pendencias'
  and exists (select 1 from profiles p where p.id = auth.uid())
);

drop policy if exists "pendencias storage: usuarios autenticados deletam" on storage.objects;
create policy "pendencias storage: usuarios autenticados deletam"
on storage.objects for delete
using (
  bucket_id = 'pendencias'
  and exists (select 1 from profiles p where p.id = auth.uid())
);
