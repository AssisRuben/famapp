-- ============================================================
-- Diagnóstico (só leitura) — Rafaela (código 27), 01-10/08/2026.
-- Em vez de listar as 295 notas (estoura limite de linhas), busca só
-- o que seria anômalo: item duplicado na mesma nota (mesmo padrão
-- achado na Wanessa), nota com origem/cancelamento/canal fora do
-- padrão, e um resumo de quantas notas por dia.
-- ============================================================

-- 1) Item duplicado na mesma nota (mesmo produto, mesmo valor, 2+ linhas)
select v.numero_nota, v.data_emissao, v.hora_emissao, vi.codigo_produto,
       vi.valor_total_liquido, count(*) as qtd_linhas_iguais
from vendas v
join venda_itens vi on vi.venda_id = v.id
where v.codigo_vendedor = 27
  and v.data_emissao between '2026-08-01' and '2026-08-10'
group by v.numero_nota, v.data_emissao, v.hora_emissao, vi.codigo_produto,
         vi.valor_total_liquido, vi.quantidade_produtos
having count(*) > 1;

-- 2) Nota com origem preenchida, cancelamento, ou canal ifood/ecommerce
select v.numero_nota, v.data_emissao, v.hora_emissao, v.numero_nota_origem,
       v.tipo_cancelamento, v.venda_ifood, v.venda_ecommerce, v.ser_nota_fiscal
from vendas v
where v.codigo_vendedor = 27
  and v.data_emissao between '2026-08-01' and '2026-08-10'
  and (v.numero_nota_origem is not null
       or v.tipo_cancelamento is not null
       or v.venda_ifood is true
       or v.venda_ecommerce is true);

-- 3) Resumo: quantas notas por dia (só 10 linhas, um dia sem venda
--    nenhuma aparece ausente, não com zero)
select v.data_emissao, count(distinct v.id) as qtd_notas
from vendas v
where v.codigo_vendedor = 27
  and v.data_emissao between '2026-08-01' and '2026-08-10'
group by v.data_emissao
order by v.data_emissao;
