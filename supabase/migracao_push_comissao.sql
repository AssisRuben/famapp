-- Notificações push (n8n) de "subiu de faixa de comissão", com
-- gamificação de medalha no app (🔰🥉🥈🥇🏆). Duas partes:
-- (1) profiles.expo_push_token — gravado pelo app no login.
-- (2) comissao_faixa_alcancada — ratchet (só sobe) da maior faixa já
--     alcançada no mês por vendedor, escrito pelo workflow n8n
--     coletor/notificacao_comissao.n8n.json.

alter table profiles add column if not exists expo_push_token text;

grant update (expo_push_token) on profiles to authenticated;

create policy "profiles: usuario atualiza o proprio push token"
on profiles for update
using (id = auth.uid())
with check (id = auth.uid());

-- Faixa "se fechasse agora" (3/5/7/8/10%), direto de faixas_comissao
-- pelo % da meta mensal batido até aqui — ver comentário completo em
-- schema.sql.
create view vw_faixa_comissao_atual as
select
  mp.codigo_vendedor,
  mp.nome_vendedor,
  mp.ano,
  mp.mes,
  mp.valor_meta,
  mp.valor_realizado,
  round(mp.valor_realizado / nullif(mp.valor_meta, 0) * 100, 2) as percentual_atingido,
  faixa.percentual_comissao as faixa_atual
from vw_metas_progresso mp
join lateral (
  select percentual_comissao
  from faixas_comissao
  where percentual_meta_min <= coalesce(round(mp.valor_realizado / nullif(mp.valor_meta, 0) * 100, 2), 0)
  order by percentual_meta_min desc
  limit 1
) faixa on true
where mp.semana is null;

alter view vw_faixa_comissao_atual set (security_invoker = true);

create table comissao_faixa_alcancada (
  codigo_vendedor integer not null references vendedores(codigo),
  ano integer not null,
  mes integer not null check (mes between 1 and 12),
  faixa_percentual numeric(5,2) not null,
  alcancada_em timestamptz not null default now(),
  primary key (codigo_vendedor, ano, mes)
);

alter table comissao_faixa_alcancada enable row level security;

create policy "comissao_faixa_alcancada: select proprio ou gestor"
on comissao_faixa_alcancada for select
using (exists (
  select 1 from profiles p
  where p.id = auth.uid()
    and (p.role = 'gestor' or p.codigo_vendedor = comissao_faixa_alcancada.codigo_vendedor)
));
