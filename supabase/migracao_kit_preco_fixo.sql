-- Kit de produto único ganha preço fixo (02/09/2026) — até agora só
-- dava pra configurar "% de desconto no último item" (3 presets fixos
-- na tela: 100/50/25%). Isso adiciona o outro formato pedido: preço
-- fechado pras N unidades (ex.: "3 por R$29,99"), mesmo padrão já
-- usado em campanha_kits (kit multi-produto) — reaproveita o nome de
-- coluna kit_preco_fixo de propósito.
alter table campanha_produtos add column kit_preco_fixo numeric(12,2)
  check (kit_preco_fixo is null or kit_preco_fixo > 0);

-- Exatamente um dos dois formatos quando é kit — mesma lógica de
-- campanha_kits_precificacao_coerente, só que aqui os dois campos já
-- existiam antes (kit_percentual_desconto_item), então o "backward
-- compat" é automático: campanha antiga tem kit_preco_fixo null e
-- kit_percentual_desconto_item preenchido, já passa na check sem
-- precisar de UPDATE nenhum.
alter table campanha_produtos add constraint campanha_produtos_kit_precificacao_coerente check (
  tipo_promocao <> 'kit'
  or ((kit_percentual_desconto_item is not null) <> (kit_preco_fixo is not null))
);
