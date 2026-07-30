-- ============================================================
-- STORAGE — bucket "receitas" para as fotos anexadas na tela
-- "Receitas" do app (venda_item_receitas.foto_url guarda só o path
-- deste bucket, não a foto em si). Privado (não público): as fotos só
-- devem ser acessíveis via signed URL, gerada sob demanda pelo app
-- pra quem tem permissão (mesma regra de venda_item_receitas).
--
-- Convenção de path OBRIGATÓRIA (as policies abaixo dependem disso):
-- receitas/<codigo_vendedor>/<venda_item_id>.jpg
-- O app precisa subir o arquivo nesse formato — é o que permite às
-- policies checarem "o vendedor é dono da pasta" sem precisar de uma
-- tabela extra de mapeamento arquivo -> vendedor.
--
-- Rodar depois de schema.sql + rls_policies.sql (depende de `profiles`).
-- ============================================================

insert into storage.buckets (id, name, public)
values ('receitas', 'receitas', false)
on conflict (id) do nothing;

-- SELECT: vendedor só lê fotos da própria pasta (storage.foldername
-- devolve um array dos segmentos do path; [1] é o primeiro segmento
-- depois do nome do bucket, ou seja, <codigo_vendedor>); gestor lê tudo.
create policy "receitas storage: select proprio ou gestor"
on storage.objects for select
using (
  bucket_id = 'receitas'
  and exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and (
        p.role = 'gestor'
        or p.codigo_vendedor::text = (storage.foldername(name))[1]
      )
  )
);

-- INSERT: vendedor só sobe foto na própria pasta; gestor em qualquer uma.
create policy "receitas storage: insert proprio ou gestor"
on storage.objects for insert
with check (
  bucket_id = 'receitas'
  and exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and (
        p.role = 'gestor'
        or p.codigo_vendedor::text = (storage.foldername(name))[1]
      )
  )
);

-- UPDATE/DELETE: mesmo padrão — útil se o vendedor precisar substituir
-- uma foto (receita ilegível) sem reabrir chamado com o gestor.
create policy "receitas storage: update proprio ou gestor"
on storage.objects for update
using (
  bucket_id = 'receitas'
  and exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and (
        p.role = 'gestor'
        or p.codigo_vendedor::text = (storage.foldername(name))[1]
      )
  )
);

create policy "receitas storage: delete proprio ou gestor"
on storage.objects for delete
using (
  bucket_id = 'receitas'
  and exists (
    select 1 from profiles p
    where p.id = auth.uid()
      and (
        p.role = 'gestor'
        or p.codigo_vendedor::text = (storage.foldername(name))[1]
      )
  )
);
