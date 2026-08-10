-- ============================================================
-- Diagnóstico (só leitura) — mesma checagem de item duplicado feita em
-- Wanessa/Rafaela, agora pra Maryana (código 29).
-- ============================================================

select v.numero_nota, v.data_emissao, v.hora_emissao, vi.codigo_produto,
       vi.valor_total_liquido, count(*) as qtd_linhas_iguais
from vendas v
join venda_itens vi on vi.venda_id = v.id
where v.codigo_vendedor = 29
  and v.data_emissao between '2026-08-01' and '2026-08-10'
group by v.numero_nota, v.data_emissao, v.hora_emissao, vi.codigo_produto, vi.valor_total_liquido
having count(*) > 1;
