-- ============================================================
-- Migração pra rodar no projeto Supabase REAL — abre a escrita de
-- receita (tabela venda_item_receitas + bucket "receitas") pra
-- qualquer vendedor/farmacêutico autenticado, não só quem fez a
-- venda original (ou gestor). Mesma decisão já tomada pra leitura de
-- vendas/clientes: um cliente pode voltar e ser atendido por outra
-- pessoa de plantão, que precisa poder anexar a receita.
-- ============================================================

-- ---------- venda_item_receitas ----------
drop policy if exists "receitas: insert proprio ou gestor" on venda_item_receitas;
drop policy if exists "receitas: update proprio ou gestor" on venda_item_receitas;

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

-- ---------- storage.objects (bucket "receitas") ----------
drop policy if exists "receitas storage: select proprio ou gestor" on storage.objects;
drop policy if exists "receitas storage: insert proprio ou gestor" on storage.objects;
drop policy if exists "receitas storage: update proprio ou gestor" on storage.objects;
drop policy if exists "receitas storage: delete proprio ou gestor" on storage.objects;

create policy "receitas storage: usuarios autenticados leem"
on storage.objects for select
using (
  bucket_id = 'receitas'
  and exists (select 1 from profiles p where p.id = auth.uid())
);

create policy "receitas storage: usuarios autenticados inserem"
on storage.objects for insert
with check (
  bucket_id = 'receitas'
  and exists (select 1 from profiles p where p.id = auth.uid())
);

create policy "receitas storage: usuarios autenticados atualizam"
on storage.objects for update
using (
  bucket_id = 'receitas'
  and exists (select 1 from profiles p where p.id = auth.uid())
);

create policy "receitas storage: usuarios autenticados deletam"
on storage.objects for delete
using (
  bucket_id = 'receitas'
  and exists (select 1 from profiles p where p.id = auth.uid())
);
