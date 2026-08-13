-- [12/08/2026] Recadastro completo do Checklist diário, substituindo o
-- que existia antes (5 atividades de exemplo do seed inicial). Definido
-- junto com o usuário: 1 tema por dia (segunda a sábado), cada tema
-- dividido em 2 atividades (manhã/tarde) com horário de lembrete
-- diferente, porque os dois turnos não batem no mesmo horário:
--   Manhã (Terezinha=5, Simone=4, Maryana=29, Wanessa=23)
--   Tarde (Rafaela=27, Tiago=14, Aline=28) -- Simone e Aline são caixa,
--   por isso ficaram só com tarefas leves na conversa que gerou isso.
--
-- dias_semana: domingo=1, segunda=2, terça=3, quarta=4, quinta=5, sexta=6, sábado=7
-- (mesma numeração do expo-notifications, sem domingo de propósito).
--
-- PENDÊNCIA MANUAL: "Conferência/auditoria de receitas" (quarta) deveria
-- ser quinzenal (dia 1 e 15), mas o Checklist só suporta recorrência
-- semanal por dia da semana -- não existe campo de "a cada N semanas".
-- Alternativas até isso ser implementado: (a) o gestor desativa essas 2
-- atividades (toggle "ativo" na tela Gerenciar Checklist) nas semanas em
-- que não deve rodar, ou (b) aceitar que roda toda quarta mesmo.

delete from atividades_checklist;

-- 1/2: Segunda - Limpeza e conferência de validade da própria prateleira
with a as (
  insert into atividades_checklist (titulo, horario, dias_semana)
  values ('Limpeza e conferência de validade da própria prateleira (manhã)', '09:00', '{2}')
  returning id
)
insert into atividade_checklist_vendedores (atividade_id, codigo_vendedor)
select id, v.codigo from a, (values (5),(4),(29),(23)) as v(codigo);

with a as (
  insert into atividades_checklist (titulo, horario, dias_semana)
  values ('Limpeza e conferência de validade da própria prateleira (tarde)', '15:00', '{2}')
  returning id
)
insert into atividade_checklist_vendedores (atividade_id, codigo_vendedor)
select id, v.codigo from a, (values (27),(14),(28)) as v(codigo);

-- 3/4: Terça - Enviar receitas das vendas controladas do dia
with a as (
  insert into atividades_checklist (titulo, horario, dias_semana)
  values ('Enviar receitas das vendas controladas do dia (manhã)', '09:00', '{3}')
  returning id
)
insert into atividade_checklist_vendedores (atividade_id, codigo_vendedor)
select id, v.codigo from a, (values (5),(4),(29),(23)) as v(codigo);

with a as (
  insert into atividades_checklist (titulo, horario, dias_semana)
  values ('Enviar receitas das vendas controladas do dia (tarde)', '15:00', '{3}')
  returning id
)
insert into atividade_checklist_vendedores (atividade_id, codigo_vendedor)
select id, v.codigo from a, (values (27),(14),(28)) as v(codigo);

-- 5/6: Quarta - Conferência/auditoria de receitas (deveria ser QUINZENAL -- ver nota acima)
with a as (
  insert into atividades_checklist (titulo, horario, dias_semana)
  values ('Conferência/auditoria de receitas (manhã)', '09:00', '{4}')
  returning id
)
insert into atividade_checklist_vendedores (atividade_id, codigo_vendedor)
select id, v.codigo from a, (values (5),(4),(29),(23)) as v(codigo);

with a as (
  insert into atividades_checklist (titulo, horario, dias_semana)
  values ('Conferência/auditoria de receitas (tarde)', '15:00', '{4}')
  returning id
)
insert into atividade_checklist_vendedores (atividade_id, codigo_vendedor)
select id, v.codigo from a, (values (27),(14),(28)) as v(codigo);

-- 7/8: Quinta - Ativação de clientes inativos
with a as (
  insert into atividades_checklist (titulo, horario, dias_semana)
  values ('Ativação de clientes inativos (manhã)', '10:00', '{5}')
  returning id
)
insert into atividade_checklist_vendedores (atividade_id, codigo_vendedor)
select id, v.codigo from a, (values (5),(4),(29),(23)) as v(codigo);

with a as (
  insert into atividades_checklist (titulo, horario, dias_semana)
  values ('Ativação de clientes inativos (tarde)', '16:00', '{5}')
  returning id
)
insert into atividade_checklist_vendedores (atividade_id, codigo_vendedor)
select id, v.codigo from a, (values (27),(14),(28)) as v(codigo);

-- 9/10: Sexta - Follow-up de antibiótico (7 dias após a venda; sem tela
-- dedicada no app ainda -- funciona como lembrete manual por enquanto)
with a as (
  insert into atividades_checklist (titulo, horario, dias_semana)
  values ('Follow-up de antibiótico (manhã)', '10:00', '{6}')
  returning id
)
insert into atividade_checklist_vendedores (atividade_id, codigo_vendedor)
select id, v.codigo from a, (values (5),(4),(29),(23)) as v(codigo);

with a as (
  insert into atividades_checklist (titulo, horario, dias_semana)
  values ('Follow-up de antibiótico (tarde)', '16:00', '{6}')
  returning id
)
insert into atividade_checklist_vendedores (atividade_id, codigo_vendedor)
select id, v.codigo from a, (values (27),(14),(28)) as v(codigo);

-- 11/12: Sábado - Follow-up de uso contínuo
with a as (
  insert into atividades_checklist (titulo, horario, dias_semana)
  values ('Follow-up de uso contínuo (manhã)', '09:00', '{7}')
  returning id
)
insert into atividade_checklist_vendedores (atividade_id, codigo_vendedor)
select id, v.codigo from a, (values (5),(4),(29),(23)) as v(codigo);

with a as (
  insert into atividades_checklist (titulo, horario, dias_semana)
  values ('Follow-up de uso contínuo (tarde)', '15:00', '{7}')
  returning id
)
insert into atividade_checklist_vendedores (atividade_id, codigo_vendedor)
select id, v.codigo from a, (values (27),(14),(28)) as v(codigo);

-- Conferência final -- roda depois dos inserts acima pra revisar o que ficou.
select a.titulo, a.horario, a.dias_semana, string_agg(v.nome, ', ' order by v.nome) as vendedores
from atividades_checklist a
left join atividade_checklist_vendedores acv on acv.atividade_id = a.id
left join vendedores v on v.codigo = acv.codigo_vendedor
group by a.id, a.titulo, a.horario, a.dias_semana
order by a.dias_semana, a.horario;
