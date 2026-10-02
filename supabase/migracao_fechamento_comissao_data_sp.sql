-- ============================================================
-- Fechamento de comissão no dia certo (01/10/2026)
--
-- fechar_comissoes_se_ultimo_dia_do_mes() usava current_date, que no
-- banco é UTC. O n8n (fechamento_comissao.n8n.json) chama às 22:30 de
-- Brasília = 01:30 UTC do dia SEGUINTE. Resultado:
--   - no último dia do mês, current_date já é dia 1 -> não fechava;
--   - no PENÚLTIMO dia, current_date já é o último -> fechava um dia
--     antes, sem as vendas do último dia.
-- Agora "hoje" é a data de Brasília.
--
-- O fechamento continua sendo upsert (fechar_comissoes_mes): rodar de
-- novo pro mesmo mês só atualiza o snapshot.
-- ============================================================

create or replace function fechar_comissoes_se_ultimo_dia_do_mes()
returns void as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ultimo_dia date := (date_trunc('month', v_hoje) + interval '1 month - 1 day')::date;
begin
  if v_hoje = v_ultimo_dia then
    perform fechar_comissoes_mes(extract(year from v_hoje)::int, extract(month from v_hoje)::int);
  end if;
end;
$$ language plpgsql;
