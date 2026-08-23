-- ============================================================
-- Migração pra rodar no projeto Supabase REAL (23/08/2026) — base do
-- "Relatório mensal" (aba nova no menu do gestor): tabela de métricas
-- fechadas mês a mês, por vendedor (quando fizer sentido) ou pra
-- farmácia inteira.
--
-- Formato chave/valor (não uma coluna fixa por métrica) de propósito
-- — adicionar métrica nova no futuro é só mais uma linha no workflow
-- de fechamento do n8n, sem precisar de migração de schema.
--
-- codigo_vendedor NULL = métrica da farmácia inteira (ex.: produtos em
-- falta reportados, pendências dadas baixa — o pedido foi só a
-- QUANTIDADE, sem quebrar por vendedor). Não-nulo = métrica daquele
-- vendedor específico (carteira, whatsapp, vendas, etc.).
--
-- unique index por expressão (coalesce) porque unique constraint comum
-- trata cada NULL como distinto — sem isso, o upsert (ON CONFLICT) do
-- workflow de fechamento duplicaria a linha da farmácia toda vez que
-- rodasse de novo pro mesmo mês.
-- ============================================================

create table metricas_mensais (
  id bigserial primary key,
  -- Sempre o dia 1 do mês (ex.: 2026-08-01) — nunca uma data específica.
  mes_referencia date not null,
  codigo_vendedor integer references vendedores(codigo),
  chave text not null,
  valor numeric(14,2) not null default 0,
  atualizado_em timestamptz not null default now()
);

create unique index metricas_mensais_unique
  on metricas_mensais (mes_referencia, chave, coalesce(codigo_vendedor, -1));

create index idx_metricas_mensais_mes on metricas_mensais (mes_referencia desc);

alter table metricas_mensais enable row level security;

-- Só gestor lê — é um relatório de acompanhamento da equipe, não dado
-- que cada vendedor precisa ver do próprio desempenho isoladamente
-- (isso já existe em Metas/Desempenho). Escrita só via service_role
-- (workflow n8n de fechamento de mês) e via trigger abaixo (roda como
-- SECURITY DEFINER, não depende de policy de insert pra funcionar) —
-- por isso não existe policy de insert/update/delete pra authenticated.
create policy "metricas_mensais: gestor le"
on metricas_mensais for select
using (exists (
  select 1 from profiles p where p.id = auth.uid() and p.role = 'gestor'
));

-- ============================================================
-- Contador ao vivo de produtos em falta reportados — produtos_em_falta
-- é lista de trabalho compartilhada (qualquer um apaga ao resolver),
-- não log de auditoria, então um snapshot no fechamento do mês
-- SUBESTIMARIA a contagem real (item reportado E resolvido no mesmo
-- mês nunca seria contado). Trigger incrementa na hora do INSERT,
-- sobrevivendo ao DELETE. SECURITY DEFINER pra funcionar mesmo quando
-- quem reporta é um vendedor comum (sem permissão de escrita em
-- metricas_mensais).
-- ============================================================
create or replace function incrementar_metrica_produtos_em_falta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into metricas_mensais (mes_referencia, codigo_vendedor, chave, valor)
  values (date_trunc('month', new.data)::date, null, 'produtos_em_falta_reportados', 1)
  on conflict (mes_referencia, chave, coalesce(codigo_vendedor, -1))
  do update set valor = metricas_mensais.valor + 1, atualizado_em = now();
  return new;
end;
$$;

create trigger trg_incrementar_produtos_em_falta
after insert on produtos_em_falta
for each row
execute function incrementar_metrica_produtos_em_falta();

-- ---------- VERIFICAÇÃO (opcional, só leitura) ----------
-- select * from metricas_mensais order by mes_referencia desc, chave limit 50;
