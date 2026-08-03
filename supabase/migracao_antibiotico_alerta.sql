-- ============================================================
-- Migração pra rodar no projeto Supabase REAL — se contatos_clientes já
-- foi criada por migracao_contatos_clientes.sql, isso amplia os CHECKs
-- pra aceitar o novo motivo 'antibiotico' e o novo tipo_contato
-- 'nao_contatado' (03/08/2026), usados pelo card "Antibiótico vendido
-- (7 dias)" em Alertas: mostra clientes que levaram antimicrobiano
-- (produto_catalogo.tipo_lista = 'T') nos últimos 7 dias; se passar a
-- semana sem ninguém ligar/mandar WhatsApp, o próprio app grava
-- 'nao_contatado' (não é ação do usuário) e o item sai da lista.
--
-- Idempotente — pode rodar de novo sem erro mesmo se já tiver rodado.
-- ============================================================

alter table contatos_clientes drop constraint if exists contatos_clientes_motivo_check;
alter table contatos_clientes add constraint contatos_clientes_motivo_check
  check (motivo in ('resgate', 'aniversario', 'uso_continuo', 'alto_valor_sumindo', 'promocao', 'antibiotico'));

alter table contatos_clientes drop constraint if exists contatos_clientes_tipo_contato_check;
alter table contatos_clientes add constraint contatos_clientes_tipo_contato_check
  check (tipo_contato in ('whatsapp', 'ligacao', 'nao_contatado'));

-- ---------- VERIFICAÇÃO (opcional, só leitura) ----------
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'contatos_clientes'::regclass;
