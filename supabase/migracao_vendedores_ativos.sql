-- Vendedores "ativos" pra fim de seletor/lançamento em massa (aba Metas
-- do gestor). NÃO usa vendedores.ativo — esse flag vem cru da Trier e
-- inclui muito código antigo/de teste que nunca foi desativado lá. Em
-- vez disso, considera ativo quem teve pelo menos 1 venda nos últimos
-- 60 dias — mesmo critério implícito que já faz o resto do app (Ranking,
-- Desempenho) só mostrar quem realmente está vendendo.
create or replace view vw_vendedores_ativos as
select v.codigo, v.nome
from vendedores v
where exists (
  select 1 from vendas ve
  where ve.codigo_vendedor = v.codigo
    and ve.data_emissao >= (current_date - interval '60 days')
)
order by v.nome;

alter view vw_vendedores_ativos set (security_invoker = true);
