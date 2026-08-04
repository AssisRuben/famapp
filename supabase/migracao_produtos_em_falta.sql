-- ============================================================
-- Migração pra rodar no projeto Supabase REAL — cria produtos_em_falta
-- (03/08/2026): registro manual e rápido de "esse produto está em
-- falta hoje", feito por qualquer vendedor no balcão.
--
-- Diferente de Compras/Dose Certa (sugestão automática por demanda e
-- estoque) — aqui é o vendedor reportando na hora, sem cálculo
-- nenhum. Lista compartilhada, não é log de auditoria: todo mundo lê,
-- edita e apaga, inclusive registro de outra pessoa.
-- ============================================================

create table if not exists produtos_em_falta (
  id bigserial primary key,
  nome_produto text not null,
  codigo_produto integer references produto_catalogo(codigo),
  data date not null,
  registrado_por uuid references auth.users(id),
  criado_em timestamptz not null default now()
);

create index if not exists idx_produtos_em_falta_data on produtos_em_falta (data desc);

alter table produtos_em_falta enable row level security;

drop policy if exists "produtos_em_falta: autenticados leem" on produtos_em_falta;
create policy "produtos_em_falta: autenticados leem"
on produtos_em_falta for select
using (exists (select 1 from profiles p where p.id = auth.uid()));

drop policy if exists "produtos_em_falta: autenticados inserem" on produtos_em_falta;
create policy "produtos_em_falta: autenticados inserem"
on produtos_em_falta for insert
with check (exists (select 1 from profiles p where p.id = auth.uid()));

drop policy if exists "produtos_em_falta: autenticados atualizam" on produtos_em_falta;
create policy "produtos_em_falta: autenticados atualizam"
on produtos_em_falta for update
using (exists (select 1 from profiles p where p.id = auth.uid()))
with check (exists (select 1 from profiles p where p.id = auth.uid()));

drop policy if exists "produtos_em_falta: autenticados apagam" on produtos_em_falta;
create policy "produtos_em_falta: autenticados apagam"
on produtos_em_falta for delete
using (exists (select 1 from profiles p where p.id = auth.uid()));

-- ---------- VERIFICAÇÃO (opcional, só leitura) ----------
-- select * from produtos_em_falta order by data desc limit 20;
