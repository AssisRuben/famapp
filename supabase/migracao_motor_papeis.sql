-- Motor de campanhas por papel (22/10/2026): cada produto proposto
-- pelo motor ganha um papel — chamariz, kit, perfumaria ou mip — e o
-- desconto sai do papel (ver coletor/motor_campanhas.n8n.json).
-- Guardado no item pra medir no fim do mês qual papel trouxe resultado.
-- null = item de campanha manual.
alter table campanha_produtos
  add column if not exists papel text
    check (papel is null or papel in ('chamariz', 'kit', 'perfumaria', 'mip'));
