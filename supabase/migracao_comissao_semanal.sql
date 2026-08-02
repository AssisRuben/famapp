-- ============================================================
-- Migração pra rodar no projeto Supabase REAL — nova regra de
-- comissão (01/08/2026, confirmada com a farmácia):
--   - Margem bruta do mês ≥100% da meta MENSAL → comissão = 10% FLAT
--     sobre a margem bruta do mês inteiro.
--   - Senão → cada semana avaliada contra a própria meta semanal,
--     acha a faixa em faixas_comissao, aplica a taxa sobre a margem
--     daquela semana, soma as 4 pra chegar na comissão do mês.
--
-- Cria também comissoes_fechadas (snapshot congelado pra folha de
-- pagamento) e as funções de fechamento, chamadas pelo workflow n8n
-- coletor/fechamento_comissao.n8n.json (todo dia 22:30, só age no
-- último dia do mês).
-- ============================================================

drop view if exists vw_metas_comissao;

create view vw_metas_comissao as
select
  mp.meta_id,
  mp.codigo_vendedor,
  mp.nome_vendedor,
  mp.ano,
  mp.mes,
  mp.valor_meta,
  mp.valor_realizado,
  round(mp.valor_realizado / nullif(mp.valor_meta, 0) * 100, 2) as percentual_atingido,
  mp.valor_realizado as margem_bruta_valor,
  round(calc.comissao_valor / nullif(mp.valor_realizado, 0) * 100, 2) as percentual_comissao,
  calc.comissao_valor,
  calc.regra_aplicada,
  calc.detalhe_semanas
from vw_metas_progresso mp
join lateral (
  select
    case
      when mp.valor_meta > 0 and mp.valor_realizado >= mp.valor_meta
        then round(mp.valor_realizado * 0.10, 2)
      else round(coalesce(semanal.total_comissao, 0), 2)
    end as comissao_valor,
    case
      when mp.valor_meta > 0 and mp.valor_realizado >= mp.valor_meta then 'flat_10_mensal'
      else 'soma_semanal'
    end as regra_aplicada,
    case
      when mp.valor_meta > 0 and mp.valor_realizado >= mp.valor_meta then null
      else semanal.detalhe
    end as detalhe_semanas
  from (
    select
      sum(s.comissao_semana) as total_comissao,
      jsonb_agg(
        jsonb_build_object(
          'semana', s.semana, 'margem', s.margem, 'meta', s.meta,
          'percentual', s.percentual, 'taxa', s.taxa, 'comissao', s.comissao_semana
        ) order by s.semana
      ) as detalhe
    from (
      select
        mps.semana,
        mps.valor_realizado as margem,
        mps.valor_meta as meta,
        round(mps.valor_realizado / nullif(mps.valor_meta, 0) * 100, 2) as percentual,
        faixa_sem.percentual_comissao as taxa,
        round(mps.valor_realizado * faixa_sem.percentual_comissao / 100, 2) as comissao_semana
      from vw_metas_progresso mps
      join lateral (
        select percentual_comissao
        from faixas_comissao
        where percentual_meta_min <= coalesce(round(mps.valor_realizado / nullif(mps.valor_meta, 0) * 100, 2), 0)
        order by percentual_meta_min desc
        limit 1
      ) faixa_sem on true
      where mps.codigo_vendedor = mp.codigo_vendedor
        and mps.ano = mp.ano
        and mps.mes = mp.mes
        and mps.semana is not null
    ) s
  ) semanal
) calc on true
where mp.semana is null;

alter view vw_metas_comissao set (security_invoker = true);

create table if not exists comissoes_fechadas (
  id bigserial primary key,
  codigo_vendedor integer not null references vendedores(codigo),
  ano integer not null,
  mes integer not null check (mes between 1 and 12),
  valor_comissao numeric(12,2) not null,
  margem_bruta_mes numeric(12,2) not null,
  meta_mensal numeric(12,2) not null,
  percentual_atingido_mensal numeric(6,2),
  regra_aplicada text not null check (regra_aplicada in ('flat_10_mensal', 'soma_semanal')),
  detalhe_semanas jsonb,
  fechado_em timestamptz not null default now(),
  unique (codigo_vendedor, ano, mes)
);

alter table comissoes_fechadas enable row level security;

drop policy if exists "comissoes_fechadas: select proprio ou gestor" on comissoes_fechadas;
create policy "comissoes_fechadas: select proprio ou gestor"
on comissoes_fechadas for select
using (exists (
  select 1 from profiles p
  where p.id = auth.uid()
    and (p.role = 'gestor' or p.codigo_vendedor = comissoes_fechadas.codigo_vendedor)
));

create or replace function fechar_comissoes_mes(p_ano integer, p_mes integer)
returns integer as $$
declare
  v_total integer;
begin
  insert into comissoes_fechadas (
    codigo_vendedor, ano, mes, valor_comissao, margem_bruta_mes,
    meta_mensal, percentual_atingido_mensal, regra_aplicada, detalhe_semanas
  )
  select
    codigo_vendedor, ano, mes, comissao_valor, margem_bruta_valor,
    valor_meta, percentual_atingido, regra_aplicada, detalhe_semanas
  from vw_metas_comissao
  where ano = p_ano and mes = p_mes
  on conflict (codigo_vendedor, ano, mes) do update set
    valor_comissao = excluded.valor_comissao,
    margem_bruta_mes = excluded.margem_bruta_mes,
    meta_mensal = excluded.meta_mensal,
    percentual_atingido_mensal = excluded.percentual_atingido_mensal,
    regra_aplicada = excluded.regra_aplicada,
    detalhe_semanas = excluded.detalhe_semanas,
    fechado_em = now();
  get diagnostics v_total = row_count;
  return v_total;
end;
$$ language plpgsql;

create or replace function fechar_comissoes_se_ultimo_dia_do_mes()
returns void as $$
declare
  v_hoje date := current_date;
  v_ultimo_dia date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
begin
  if v_hoje = v_ultimo_dia then
    perform fechar_comissoes_mes(extract(year from v_hoje)::int, extract(month from v_hoje)::int);
  end if;
end;
$$ language plpgsql;

-- ---------- VERIFICAÇÃO (opcional, só leitura) ----------
-- Confere a estimativa "ao vivo" do mês corrente pra cada vendedor:
-- select nome_vendedor, valor_meta, margem_bruta_valor, percentual_atingido, regra_aplicada, comissao_valor, detalhe_semanas
-- from vw_metas_comissao
-- order by nome_vendedor;
--
-- Testa o fechamento manualmente pra um mês (não precisa esperar o
-- n8n) — seguro rodar, é idempotente:
-- select fechar_comissoes_mes(2026, 8);
-- select * from comissoes_fechadas where ano = 2026 and mes = 8;
