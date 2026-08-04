-- ============================================================
-- Limpeza (03/08/2026) — remove a campanha de teste que pegou "taxa de
-- entrega" como produto (sobra da 1ª versão do exemplo_venda_adicional.sql,
-- antes de excluir SERVICOS/entrega da busca por "produto mais vendido").
-- campanha_venda_adicional_produtos apaga junto (on delete cascade).
-- ============================================================

delete from campanhas_venda_adicional
where nome ilike '%entrega%' or nome ilike '%frete%' or nome ilike '%delivery%';

-- ---------- VERIFICAÇÃO (opcional, só leitura) ----------
-- select * from campanhas_venda_adicional order by criada_em desc;
