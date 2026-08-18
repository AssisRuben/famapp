-- [18/08/2026] Promoção "kit" (ex.: "compre 3 pague 2", "50% no 2º
-- item") como alternativa ao desconto simples por unidade em
-- campanha_produtos. Aplicada por PRODUTO, não pela campanha inteira.
alter table campanha_produtos
  add column if not exists tipo_promocao text not null default 'unitario'
    check (tipo_promocao in ('unitario', 'kit')),
  add column if not exists kit_quantidade_minima integer check (kit_quantidade_minima is null or kit_quantidade_minima >= 2),
  add column if not exists kit_percentual_desconto_item numeric(5,2)
    check (kit_percentual_desconto_item is null or kit_percentual_desconto_item between 0 and 100);
