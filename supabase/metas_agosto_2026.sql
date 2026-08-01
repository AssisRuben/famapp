-- ============================================================
-- Metas de agosto/2026 — cadastro manual (não vem da Trier).
-- Rodar no SQL Editor do projeto Supabase real.
--
-- Fonte: "Meta Base" (valor mensal real por vendedor) passado pelo
-- usuário em 01/08/2026, com a divisão semanal calculada aplicando a
-- MESMA PROPORÇÃO por semana que cada vendedor tinha na tabela
-- detalhada anterior (a proporção varia por pessoa — Terezinha/Tiago
-- têm uma divisão, Rafaela outra, Simone/Aline/Maryana outra).
--
-- Wanessa está de férias — sem meta cadastrada esse mês de propósito
-- (o delete abaixo cobre o caso de já ter rodado a versão anterior
-- deste arquivo, que tinha incluído ela por engano).
--
-- Idempotente (ON CONFLICT DO UPDATE) — seguro rodar de novo.
-- ============================================================

delete from metas where codigo_vendedor = 23 and ano = 2026 and mes = 8; -- Wanessa (férias)

-- Metas MENSAIS
insert into metas (codigo_vendedor, ano, mes, semana, valor_meta) values
  (4,  2026, 8, null, 7500.00),  -- Simone
  (5,  2026, 8, null, 26000.00), -- Terezinha
  (14, 2026, 8, null, 23250.00), -- Tiago
  (27, 2026, 8, null, 18250.00), -- Rafaela
  (28, 2026, 8, null, 6000.00),  -- Aline
  (29, 2026, 8, null, 14000.00)  -- Maryana
on conflict (codigo_vendedor, ano, mes) where semana is null
do update set valor_meta = excluded.valor_meta, updated_at = now();

-- Metas SEMANAIS (semana 1 = dias 1-7, 2 = 8-14, 3 = 15-21, 4 = 22-fim do mês)
insert into metas (codigo_vendedor, ano, mes, semana, valor_meta) values
  (4,  2026, 8, 1, 1912.50), (4,  2026, 8, 2, 1669.50), (4,  2026, 8, 3, 1669.50), (4,  2026, 8, 4, 2190.00), -- Simone
  (5,  2026, 8, 1, 6630.00), (5,  2026, 8, 2, 5878.26), (5,  2026, 8, 3, 5878.26), (5,  2026, 8, 4, 7613.48), -- Terezinha
  (14, 2026, 8, 1, 5928.75), (14, 2026, 8, 2, 5256.52), (14, 2026, 8, 3, 5256.52), (14, 2026, 8, 4, 6808.21), -- Tiago
  (27, 2026, 8, 1, 4395.21), (27, 2026, 8, 2, 3897.14), (27, 2026, 8, 3, 3897.14), (27, 2026, 8, 4, 5047.18), -- Rafaela
  (28, 2026, 8, 1, 1530.00), (28, 2026, 8, 2, 1356.52), (28, 2026, 8, 3, 1356.52), (28, 2026, 8, 4, 1756.96), -- Aline
  (29, 2026, 8, 1, 3570.00), (29, 2026, 8, 2, 3165.20), (29, 2026, 8, 3, 3165.20), (29, 2026, 8, 4, 4099.56)  -- Maryana
on conflict (codigo_vendedor, ano, mes, semana) where semana is not null
do update set valor_meta = excluded.valor_meta, updated_at = now();
