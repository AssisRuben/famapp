-- Aba "Check list" (gestor): passa a permitir escolher um vendedor
-- específico (em vez de valer sempre pra todo mundo) e quais dias da
-- semana a atividade se aplica, além da hora do lembrete (só a hora —
-- minuto sempre 00).
--
-- codigo_vendedor null = atividade continua valendo pra todo mundo
-- (comportamento antigo, preservado por padrão nas linhas existentes).
-- dias_semana usa a numeração do expo-notifications (domingo=1 ...
-- sábado=7); default segunda a sábado = mesmo comportamento fixo que
-- já existia antes desse campo existir.
alter table atividades_checklist
  add column if not exists codigo_vendedor integer references vendedores(codigo),
  add column if not exists dias_semana integer[] not null default '{2,3,4,5,6,7}';
