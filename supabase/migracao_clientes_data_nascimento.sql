-- ============================================================
-- Migração pra rodar no projeto Supabase REAL — adiciona a coluna
-- data_nascimento em clientes (a API da Trier manda esse campo,
-- ClienteIntegracaoDto.dataNascimento, mas não estava sendo
-- sincronizado). Rodar ANTES de migracao_clientes_vendedor.sql.
--
-- Depois de rodar isso, os dados de nascimento só aparecem depois do
-- PRÓXIMO sync de clientes (backfill_periodo.js ENTIDADES=cliente, ou
-- o próximo ciclo do n8n — ele sincroniza cliente via obter-alterados,
-- então só clientes alterados recentemente vêm automaticamente; pra
-- preencher todo mundo de uma vez, rode
-- `ENTIDADES=cliente node backfill_periodo.js` manualmente).
-- ============================================================

alter table clientes add column if not exists data_nascimento date;
