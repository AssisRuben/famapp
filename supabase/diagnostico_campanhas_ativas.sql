-- ============================================================
-- Diagnóstico (só leitura) — o card de Venda Adicional soma TODAS as
-- campanhas ativas, não só a que está expandida na tela. Se o número
-- do card não bate com o total/ranking de uma campanha específica, é
-- sinal de que tem outra campanha ativa junto (03/08/2026).
-- ============================================================

select id, nome, data_inicio, data_fim, tipo_premiacao, criterio_quantidade
from campanhas_venda_adicional
where data_inicio <= current_date and data_fim >= current_date
order by criada_em desc;
