-- ============================================================
-- Migração pra rodar no projeto Supabase REAL — libera leitura de
-- vendas/venda_itens/vendedores/vendas_vendedor_diario/metas/receitas
-- pra qualquer usuário autenticado, não só gestor ou o próprio
-- vendedor (01/08/2026: "no dashboard do vendedor, deixa exatamente
-- igual do gestor, eles devem ver a venda geral e o resultado dos
-- outros").
--
-- Escrita continua restrita como já era (metas só gestor escreve;
-- venda_item_receitas só quem atendeu a venda ou gestor edita — só a
-- LEITURA da fila inteira foi liberada).
--
-- Também inclui vw_clientes_inatividade (tela "Clientes" e o tile
-- "Clientes inativos" do Painel) — confirmado depois que vendedor deve
-- ver todo cliente, não só os próprios (mesma decisão de escopo).
--
-- Deliberadamente FORA desta migração: checklist_respostas continua
-- "próprio ou gestor" — não é dado de venda/cliente, não foi pedido.
--
-- Idempotente na prática (drop if exists + create), seguro rodar mais
-- de uma vez.
-- ============================================================

drop policy if exists "vendedores: gestor le tudo" on vendedores;
drop policy if exists "vendedores: vendedor le o proprio registro" on vendedores;
create policy "vendedores: usuarios autenticados leem"
on vendedores for select
using (exists (select 1 from profiles p where p.id = auth.uid()));

drop policy if exists "vendas: gestor le tudo" on vendas;
drop policy if exists "vendas: vendedor le as proprias" on vendas;
create policy "vendas: usuarios autenticados leem"
on vendas for select
using (exists (select 1 from profiles p where p.id = auth.uid()));

drop policy if exists "venda_itens: gestor le tudo" on venda_itens;
drop policy if exists "venda_itens: vendedor le os proprios" on venda_itens;
create policy "venda_itens: usuarios autenticados leem"
on venda_itens for select
using (exists (select 1 from profiles p where p.id = auth.uid()));

drop policy if exists "vvd: gestor le tudo" on vendas_vendedor_diario;
drop policy if exists "vvd: vendedor le o proprio" on vendas_vendedor_diario;
create policy "vvd: usuarios autenticados leem"
on vendas_vendedor_diario for select
using (exists (select 1 from profiles p where p.id = auth.uid()));

drop policy if exists "metas: select proprio ou gestor" on metas;
create policy "metas: usuarios autenticados leem"
on metas for select
using (exists (select 1 from profiles p where p.id = auth.uid()));

drop policy if exists "receitas: select proprio ou gestor" on venda_item_receitas;
create policy "receitas: usuarios autenticados leem"
on venda_item_receitas for select
using (exists (select 1 from profiles p where p.id = auth.uid()));

-- vw_clientes_inatividade não usa RLS automática (roda com
-- security_invoker=false, controle manual no WHERE) — mesmas colunas
-- de antes, só tira a restrição "ou é o vendedor da última compra".
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
);
