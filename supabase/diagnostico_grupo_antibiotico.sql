-- ============================================================
-- Diagnóstico (só leitura) — qual critério captura melhor "produto
-- antimicrobiano" no catálogo (03/08/2026).
--
-- RESULTADO: união (categoria='ANTIMICROBIANOS' or grupo ilike
-- '%ANTIMICROBIANOS%' or tipo_lista='T') deu qtd_vendida_7d=18 — igual
-- ao tipo_lista='T' sozinho. Ou seja, os 8 produtos do gap original
-- (AZITROMICINA 500MG 5CP REV etc., achados em diagnostico_antibioticos.sql)
-- continuam de fora mesmo com union — suspeita: são cadastros
-- duplicados mal preenchidos (mesmo nome, código diferente, sem
-- categoria/grupo/tipo_lista nenhum), não um problema de qual campo
-- usar. Confirmando abaixo.
-- ============================================================

-- Conferir categoria/grupo/tipo_lista exatamente dos 8 códigos do gap
select codigo, nome, categoria, grupo, tipo_lista
from produto_catalogo
where codigo in (10004, 10233, 11253, 19347, 11680, 3162, 13804, 4006)
order by codigo;
