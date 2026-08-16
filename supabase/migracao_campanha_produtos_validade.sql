-- [18/08/2026] Validade por item em Cartazetes passa a persistir de
-- verdade em campanha_produtos, em vez de só valer pra impressão/txt
-- daquele momento (achado registrado em 05/08, resolvido agora).
--
-- Nullable de propósito: null = "sem override, segue a validade da
-- campanha" (mesmo padrão de precoRegular ser derivado, não uma cópia
-- congelada) — só grava valor quando o item realmente diverge da
-- campanha. Campanhas antigas (linhas já existentes) ficam null
-- automaticamente e continuam caindo pra validade da campanha, sem
-- precisar de backfill.
alter table campanha_produtos
  add column if not exists data_inicio date,
  add column if not exists data_fim date;
