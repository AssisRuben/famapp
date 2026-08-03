-- ============================================================
-- Migração pra rodar no projeto Supabase REAL — cria/atualiza
-- vw_vendas_antimicrobiano_recente, usada pelo card "Antibiótico
-- vendido" em Alertas (03/08/2026).
--
-- Substitui a fonte de dados anterior (vw_vendas_receita_status
-- filtrada por tipo_receita='antimicrobiano'), que tinha gap de
-- cadastro confirmado com dado real: produto duplicado no Trier — uma
-- entrada bem cadastrada (tipo_lista='T') e outra sem nada preenchido
-- (nem tipo_lista, nem categoria, nem grupo), e é a mal cadastrada que
-- aparece na venda de verdade. categoria='ANTIMICROBIANOS' ou grupo
-- contendo 'ANTIMICROBIANOS' cobre PARTE do buraco (produto com
-- classificação preenchida mas sem tipo_lista) — mas não cobre os
-- códigos completamente sem classificação nenhuma, tipo
-- "AZITROMICINA 500MG 5CP REV" cód. 10004.
--
-- Por isso o 4º critério: nome do princípio ativo (ilike), stopgap
-- MANUAL enquanto o cadastro duplicado não é corrigido no Trier —
-- confirmado com o usuário 03/08/2026 que é o caminho aceito por
-- enquanto (correção definitiva ainda fica pendente no Trier).
--
-- Idempotente — "create or replace view" pode rodar de novo sem erro,
-- inclusive se já rodou a versão anterior desse arquivo (sem o nome).
-- ============================================================

create or replace view vw_vendas_antimicrobiano_recente as
select
  vi.id as venda_item_id,
  v.data_emissao as data_venda,
  pc.codigo as codigo_produto,
  pc.nome as nome_produto,
  v.codigo_cliente,
  c.nome as nome_cliente
from venda_itens vi
join vendas v on v.id = vi.venda_id
join produto_catalogo pc on pc.codigo = vi.codigo_produto
left join clientes c on c.codigo = v.codigo_cliente
where v.data_emissao >= current_date - interval '30 days'
  and (
    pc.categoria = 'ANTIMICROBIANOS'
    or pc.grupo ilike '%ANTIMICROBIANOS%'
    or nullif(trim(pc.tipo_lista), '') = 'T'
    or pc.nome ilike '%amoxicilina%' or pc.nome ilike '%azitromicina%' or pc.nome ilike '%cefalexina%'
    or pc.nome ilike '%ciprofloxacino%' or pc.nome ilike '%doxiciclina%' or pc.nome ilike '%claritromicina%'
    or pc.nome ilike '%penicilina%' or pc.nome ilike '%sulfametoxazol%' or pc.nome ilike '%norfloxacino%'
    or pc.nome ilike '%metronidazol%' or pc.nome ilike '%levofloxacino%' or pc.nome ilike '%fluconazol%'
    or pc.nome ilike '%cefadroxila%' or pc.nome ilike '%eritromicina%' or pc.nome ilike '%ampicilina%'
    or pc.nome ilike '%cefaclor%'
  );

alter view vw_vendas_antimicrobiano_recente set (security_invoker = true);

-- ---------- VERIFICAÇÃO (opcional, só leitura) ----------
-- select count(*) from vw_vendas_antimicrobiano_recente where data_venda >= current_date - 7 and codigo_cliente is not null;
