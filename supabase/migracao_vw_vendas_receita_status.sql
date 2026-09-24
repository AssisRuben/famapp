-- ============================================================
-- Fix: vw_vendas_receita_status tinha corte de data FIXO
-- (23/09/2026, auditoria de performance)
--
-- where v.data_emissao >= '2026-07-01' era uma âncora parada no
-- calendário, não uma janela móvel — cada mês que passa a view varre
-- mais histórico (sem nunca esquecer nada), a query fica mais lenta, e
-- getVendasComReceita (Receitas) fica mais perto de estourar as 1000
-- linhas por request do PostgREST (já corrigido separadamente com
-- paginação, mas a causa raiz do crescimento sem fim continuava aqui).
--
-- Troca pra 120 dias móveis: cobre a mesma janela de acompanhamento
-- que o card "Receita pendente" de Alertas já usa (7 dias pra virar
-- alerta) com folga de sobra pra receita antiga ainda sem anexo
-- aparecer na lista.
-- ============================================================
create or replace view vw_vendas_receita_status as
select
  vi.id as venda_item_id,
  v.data_emissao as data_venda,
  pc.codigo as codigo_produto,
  pc.nome as nome_produto,
  case when trim(pc.tipo_lista) = 'T' then 'antimicrobiano' else 'controle_especial' end as tipo_receita,
  v.codigo_cliente,
  c.nome as nome_cliente,
  v.codigo_vendedor,
  vd.nome as nome_vendedor,
  (r.id is not null) as receita_anexada,
  r.data_anexo,
  r.foto_url
from venda_itens vi
join vendas v on v.id = vi.venda_id
join produto_catalogo pc on pc.codigo = vi.codigo_produto and nullif(trim(pc.tipo_lista), '') is not null
left join clientes c on c.codigo = v.codigo_cliente
left join vendedores vd on vd.codigo = v.codigo_vendedor
left join venda_item_receitas r on r.venda_item_id = vi.id
where v.data_emissao >= current_date - interval '120 days';
