-- [18/08/2026] Classificação em lote de itens da sugestão de compras
-- (aba Compras, gestor-only) — resolve "não vou comprar esse produto
-- específico porque já resolvi de outro jeito" sem mexer no cálculo de
-- demanda/estoque. Motivo fixo (não texto livre) pra dar pra filtrar/
-- relatar depois; 'outros' aceita observação livre.
--
-- Uma linha ATIVA por produto (unique) — reclassificar substitui;
-- remover a linha (via app) volta o produto pra sugestão normal. Não
-- expira sozinho: se a decisão foi "não repor essa marca", reaparecer
-- automaticamente contradiz a decisão.
create table compras_classificacoes (
  id bigserial primary key,
  codigo_produto integer not null unique references produto_catalogo(codigo),
  motivo text not null check (motivo in ('outro_laboratorio', 'ja_comprado', 'outros')),
  observacao text,
  classificado_em timestamptz not null default now(),
  classificado_por uuid references profiles(id)
);

alter table compras_classificacoes enable row level security;

-- Mesmo padrão de acesso da aba Compras inteira: só gestor (ver
-- RootNavigator.tsx — item "Compras" só aparece no menu do gestor).
create policy "compras_classificacoes: gestor le"
on compras_classificacoes for select
using (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
));

create policy "compras_classificacoes: gestor insere"
on compras_classificacoes for insert
with check (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
));

create policy "compras_classificacoes: gestor atualiza"
on compras_classificacoes for update
using (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
))
with check (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
));

create policy "compras_classificacoes: gestor deleta"
on compras_classificacoes for delete
using (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
));

-- vw_compras_classificacoes: resolve nome do produto e de quem
-- classificou, pro app não precisar de outra query pra exibir a lista
-- "Classificados (N)". SEM security_invoker de propósito (mesmo motivo
-- de vw_produtos_em_falta): RLS de `profiles` só deixa cada um ler o
-- PRÓPRIO perfil, então em modo invoker o join pra resolver o nome de
-- QUALQUER OUTRO gestor voltaria nulo. Roda com privilégio de dono, e
-- por isso o gate de acesso (só gestor) fica embutido na própria
-- query, não depende mais da RLS de compras_classificacoes.
create view vw_compras_classificacoes as
select
  cc.id,
  cc.codigo_produto,
  pc.nome as nome_produto,
  cc.motivo,
  cc.observacao,
  cc.classificado_em,
  coalesce(vd.nome, 'Gestor(a) da Farmácia') as nome_classificado_por
from compras_classificacoes cc
join produto_catalogo pc on pc.codigo = cc.codigo_produto
left join profiles perfil on perfil.id = cc.classificado_por
left join vendedores vd on vd.codigo = perfil.codigo_vendedor
where exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor');

-- ---------- VERIFICAÇÃO (opcional, só leitura) ----------
-- select * from vw_compras_classificacoes order by classificado_em desc limit 20;
