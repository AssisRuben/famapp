-- ============================================================
-- Diagnóstico (só leitura) — investigação item a item de Rafaela
-- (código 27, 6 vendas a mais que a Trier) e Wanessa (código 23,
-- mesma quantidade de vendas mas valor diferente), período 01-10/08.
-- ============================================================

-- 1) RAFAELA — 1 linha por NOTA (não por item), com sinais que ajudam a
--    achar duplicata/nota estranha: numero_nota_origem preenchido
--    (nota veio de outra), tipo_cancelamento, canal (ifood/ecommerce),
--    ser_nota_fiscal. Compare essa lista com o detalhe por nota da
--    própria Trier pra achar quais 6 notas não estão lá.
select
  v.id,
  v.numero_nota,
  v.numero_nota_origem,
  v.data_emissao,
  v.hora_emissao,
  v.tipo_cancelamento,
  v.venda_ifood,
  v.venda_ecommerce,
  v.ser_nota_fiscal,
  v.cod_filial,
  count(vi.id) as qtd_itens,
  round(sum(vi.valor_total_liquido), 2) as valor_liquido_nota
from vendas v
join venda_itens vi on vi.venda_id = v.id
where v.codigo_vendedor = 27
  and v.data_emissao between '2026-08-01' and '2026-08-10'
group by v.id, v.numero_nota, v.numero_nota_origem, v.data_emissao, v.hora_emissao,
         v.tipo_cancelamento, v.venda_ifood, v.venda_ecommerce, v.ser_nota_fiscal, v.cod_filial
order by v.data_emissao, v.numero_nota;

-- 2) WANESSA — 1 linha por ITEM (as 20 notas batem em quantidade, o
--    problema está no VALOR de algum item específico). Olhe
--    vlr_desconto/venda_com_desconto e os 3 campos de custo pra achar
--    qual item tem valor diferente do que a Trier mostra.
select
  v.numero_nota,
  v.data_emissao,
  v.hora_emissao,
  v.tipo_cancelamento,
  vi.codigo_produto,
  vi.quantidade_produtos,
  vi.valor_total_bruto,
  vi.valor_total_liquido,
  vi.vlr_desconto,
  vi.venda_com_desconto,
  vi.vlr_custo_produto,
  vi.valor_total_custo,
  vi.vlr_custo_aquisicao
from vendas v
join venda_itens vi on vi.venda_id = v.id
where v.codigo_vendedor = 23
  and v.data_emissao between '2026-08-01' and '2026-08-10'
order by v.numero_nota, vi.id;
