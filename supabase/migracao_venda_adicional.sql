-- ============================================================
-- Migração pra rodar no projeto Supabase REAL — cria as campanhas de
-- Venda Adicional (03/08/2026): incentivo pontual pra vendedor
-- empurrar produto(s) específico(s) num período, com premiação em
-- ranking (1º/2º/3º) ou meta individual (bateu X, ganha R$Y).
--
-- Diferente de `campanhas`/`campanha_produtos` (aquilo é preço de
-- cartazete) — aqui é só incentivo de venda, sem mexer em preço. Todo
-- vendedor lê (card "Venda adicional" em Alertas), só gestor escreve
-- (aba "Venda adicional").
-- ============================================================

create table if not exists campanhas_venda_adicional (
  id bigserial primary key,
  nome text not null,
  data_inicio date not null,
  data_fim date not null,
  tipo_premiacao text not null check (tipo_premiacao in ('ranking', 'meta_individual')),
  meta_quantidade integer check (meta_quantidade > 0),
  premiacao_meta_valor numeric(12,2) check (premiacao_meta_valor > 0),
  premiacao_ranking jsonb,
  minimo_para_concorrer integer check (minimo_para_concorrer > 0),
  criterio_quantidade text not null default 'acumulado_periodo'
    check (criterio_quantidade in ('acumulado_periodo', 'mesma_venda', 'venda_com_outros_itens')),
  horario_lembrete text,
  criado_por uuid references auth.users(id),
  criada_em timestamptz not null default now(),
  constraint venda_adicional_datas_coerentes check (data_fim >= data_inicio)
);

create table if not exists campanha_venda_adicional_produtos (
  id bigserial primary key,
  campanha_id bigint not null references campanhas_venda_adicional(id) on delete cascade,
  codigo_produto integer not null references produto_catalogo(codigo),
  unique (campanha_id, codigo_produto)
);

create index if not exists idx_cva_produtos_campanha on campanha_venda_adicional_produtos (campanha_id);

create or replace view vw_venda_adicional_vendas as
select
  cvap.campanha_id,
  vi.id as venda_item_id,
  v.data_emissao,
  v.hora_emissao,
  vi.codigo_produto,
  pc.nome as nome_produto,
  vi.quantidade_produtos as quantidade,
  v.codigo_vendedor,
  vd.nome as nome_vendedor,
  v.codigo_cliente,
  c.nome as nome_cliente,
  v.id as venda_id,
  v.numero_nota,
  (select count(*) from venda_itens vi2 where vi2.venda_id = vi.venda_id) as qtd_itens_na_venda,
  (
    select string_agg(distinct coalesce(pc2.nome, 'Produto ' || vi2.codigo_produto), ', ')
    from venda_itens vi2
    left join produto_catalogo pc2 on pc2.codigo = vi2.codigo_produto
    where vi2.venda_id = vi.venda_id and vi2.id <> vi.id
  ) as outros_produtos_na_venda
from campanha_venda_adicional_produtos cvap
join campanhas_venda_adicional camp on camp.id = cvap.campanha_id
join venda_itens vi on vi.codigo_produto = cvap.codigo_produto
join vendas v on v.id = vi.venda_id and v.data_emissao between camp.data_inicio and camp.data_fim
left join produto_catalogo pc on pc.codigo = vi.codigo_produto
left join vendedores vd on vd.codigo = v.codigo_vendedor
left join clientes c on c.codigo = v.codigo_cliente;

alter view vw_venda_adicional_vendas set (security_invoker = true);

alter table campanhas_venda_adicional enable row level security;
alter table campanha_venda_adicional_produtos enable row level security;

drop policy if exists "campanhas_venda_adicional: autenticados leem" on campanhas_venda_adicional;
create policy "campanhas_venda_adicional: autenticados leem"
on campanhas_venda_adicional for select
using (exists (select 1 from profiles p where p.id = auth.uid()));

drop policy if exists "campanhas_venda_adicional: gestor insere" on campanhas_venda_adicional;
create policy "campanhas_venda_adicional: gestor insere"
on campanhas_venda_adicional for insert
with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'));

drop policy if exists "campanhas_venda_adicional: gestor atualiza" on campanhas_venda_adicional;
create policy "campanhas_venda_adicional: gestor atualiza"
on campanhas_venda_adicional for update
using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'))
with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'));

drop policy if exists "campanhas_venda_adicional: gestor apaga" on campanhas_venda_adicional;
create policy "campanhas_venda_adicional: gestor apaga"
on campanhas_venda_adicional for delete
using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'));

drop policy if exists "campanha_venda_adicional_produtos: autenticados leem" on campanha_venda_adicional_produtos;
create policy "campanha_venda_adicional_produtos: autenticados leem"
on campanha_venda_adicional_produtos for select
using (exists (select 1 from profiles p where p.id = auth.uid()));

drop policy if exists "campanha_venda_adicional_produtos: gestor insere" on campanha_venda_adicional_produtos;
create policy "campanha_venda_adicional_produtos: gestor insere"
on campanha_venda_adicional_produtos for insert
with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'));

drop policy if exists "campanha_venda_adicional_produtos: gestor apaga" on campanha_venda_adicional_produtos;
create policy "campanha_venda_adicional_produtos: gestor apaga"
on campanha_venda_adicional_produtos for delete
using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'));

-- ---------- VERIFICAÇÃO (opcional, só leitura) ----------
-- select * from campanhas_venda_adicional order by criada_em desc limit 10;
