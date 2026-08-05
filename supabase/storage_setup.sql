-- ============================================================
-- STORAGE — bucket "receitas" para as fotos anexadas na tela
-- "Receitas" do app (venda_item_receitas.foto_url guarda só o path
-- deste bucket, não a foto em si). Privado (não público): as fotos só
-- devem ser acessíveis via signed URL, gerada sob demanda pelo app
-- pra quem tem permissão (mesma regra de venda_item_receitas).
--
-- Convenção de path: receitas/<codigo_vendedor>/<venda_item_id>.jpg
-- (<codigo_vendedor> é do vendedor DONO DA VENDA original, não de
-- quem anexou a foto — só organiza em pastas, não limita mais quem
-- pode escrever, ver policies abaixo).
--
-- [02/08/2026] Leitura E escrita liberadas pra qualquer autenticado —
-- mesma decisão de venda_item_receitas: qualquer vendedor/farmacêutico
-- de plantão pode anexar a receita, não só quem fez a venda original.
--
-- Rodar depois de schema.sql + rls_policies.sql (depende de `profiles`).
-- ============================================================

insert into storage.buckets (id, name, public)
values ('receitas', 'receitas', false)
on conflict (id) do nothing;

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

-- bucket "pendencias" (06/08/2026) — foto anexada ao registrar uma
-- pendência (aba "Pendências"). Mesma convenção de "receitas": privado,
-- path = <nome-de-arquivo-único>.jpg (sem pasta por vendedor aqui, já
-- que "todo mundo tem acesso" sem distinção nenhuma).
insert into storage.buckets (id, name, public)
values ('pendencias', 'pendencias', false)
on conflict (id) do nothing;

create policy "pendencias storage: usuarios autenticados leem"
on storage.objects for select
using (
  bucket_id = 'pendencias'
  and exists (select 1 from profiles p where p.id = auth.uid())
);

create policy "pendencias storage: usuarios autenticados inserem"
on storage.objects for insert
with check (
  bucket_id = 'pendencias'
  and exists (select 1 from profiles p where p.id = auth.uid())
);

create policy "pendencias storage: usuarios autenticados atualizam"
on storage.objects for update
using (
  bucket_id = 'pendencias'
  and exists (select 1 from profiles p where p.id = auth.uid())
);

create policy "pendencias storage: usuarios autenticados deletam"
on storage.objects for delete
using (
  bucket_id = 'pendencias'
  and exists (select 1 from profiles p where p.id = auth.uid())
);
