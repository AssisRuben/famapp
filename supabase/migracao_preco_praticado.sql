-- ============================================================
-- Preço praticado atual (23/09/2026, simplificado no mesmo dia)
--
-- Contexto: produto_catalogo.preco_venda é o preço de TABELA cadastrado
-- na Trier, e diagnóstico real mostrou que ele é fictício em boa parte
-- do catálogo — genérico sai em média a 70% da tabela (às vezes 4x
-- menos: Losartana com tabela R$24,45 vendida a R$4,57), por desconto
-- padrão de balcão que não está registrado em lugar nenhum do
-- cadastro. Usar preco_venda como "preço atual" nas telas de
-- Campanhas/Kits/Precificação levou o motor de sugestão a propor
-- "desconto" que na prática seria AUMENTO de preço.
--
-- Definição: preço praticado = preço da ÚLTIMA VENDA, sem mediana nem
-- janela. Se o preço mudou, mudou — não faz sentido esperar 2-3 vendas
-- "confirmarem" um preço que já é o vigente agora (achado 23/09/2026,
-- produto 20181: última venda R$49,90, mas mediana de qualquer janela
-- dava ~R$45 porque só 1 de 6 vendas em 30 dias estava no preço novo;
-- a mediana estava sendo cautelosa demais contra o dado real).
--
-- Método descartado: mediana em cascata de janela (14→30→90 dias).
-- Resolvia bem giro alto (26438: preço caiu de R$9,99 pra R$7,90,
-- cascata acertou em 14 dias) mas continuava errando giro baixo
-- (20181: preço subiu, cascata precisou de várias vendas concordando
-- pra mudar, e a farmácia não espera isso — o preço já está em vigor
-- desde a primeira venda nele).
--
-- Contrapartida aceita: uma venda isolada com preço fora do padrão
-- (erro de caixa, exceção pontual) também vira "preço praticado" até a
-- próxima venda. Mitigado pelo fato de que a proposta de campanha
-- sempre passa por revisão humana antes de virar cartaz — não é
-- gravação direta no PDV.
-- ============================================================
drop view if exists vw_preco_praticado_atual;

create view vw_preco_praticado_atual
with (security_invoker = true) as
select distinct on (vi.codigo_produto)
  vi.codigo_produto,
  round((vi.valor_total_liquido / nullif(vi.quantidade_produtos,0))::numeric, 2) as preco_praticado,
  v.data_emissao as data_ultima_venda
from venda_itens vi
join vendas v on v.id = vi.venda_id
where v.tipo_cancelamento is null and vi.quantidade_produtos > 0 and vi.valor_total_liquido > 0
  -- 180 dias: teto de "recente o bastante pra significar algo" — produto
  -- sem venda nenhuma nesse período fica fora da view, e quem consome
  -- cai no fallback precoPraticado ?? precoVenda (tabela).
  and v.data_emissao >= current_date - interval '180 days'
order by vi.codigo_produto, v.data_emissao desc, v.id desc;

comment on view vw_preco_praticado_atual is
  'Preço real pago pelo cliente na venda mais recente (não o de tabela, não uma mediana) — reflete mudança de preço a partir da primeira venda no novo valor, sem esperar confirmação. Usado por Campanhas/Kits/Precificação em vez de produto_catalogo.preco_venda, que é frequentemente fictício.';
