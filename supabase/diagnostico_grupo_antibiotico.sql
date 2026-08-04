-- ============================================================
-- Diagnóstico (só leitura) — conferir falso positivo no stopgap por
-- nome do card "Antibiótico vendido" (03/08/2026). Lista só os
-- produtos pegos PELO NOME (não seriam pegos por categoria/grupo/
-- tipo_lista sozinhos) — é a parte "manual" que precisa bater o olho.
-- ============================================================

select codigo, nome, categoria, grupo, tipo_lista
from produto_catalogo
where coalesce(categoria, '') <> 'ANTIMICROBIANOS'
  and coalesce(grupo, '') not ilike '%ANTIMICROBIANOS%'
  and coalesce(nullif(trim(tipo_lista), ''), '') <> 'T'
  and (
    nome ilike '%amoxicilina%' or nome ilike '%azitromicina%' or nome ilike '%cefalexina%'
    or nome ilike '%ciprofloxacino%' or nome ilike '%doxiciclina%' or nome ilike '%claritromicina%'
    or nome ilike '%penicilina%' or nome ilike '%sulfametoxazol%' or nome ilike '%norfloxacino%'
    or nome ilike '%metronidazol%' or nome ilike '%levofloxacino%' or nome ilike '%fluconazol%'
    or nome ilike '%cefadroxila%' or nome ilike '%eritromicina%' or nome ilike '%ampicilina%'
    or nome ilike '%cefaclor%'
  )
order by nome;
