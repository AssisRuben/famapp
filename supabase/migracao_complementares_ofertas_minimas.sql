-- ============================================================
-- Vendas Complementares: mínimo de clientes OFERTADOS no período pra
-- receber prêmio (02/10/2026)
--
-- Regra da farmácia: quem não ofertar o complementar a pelo menos 60
-- clientes no período da campanha não recebe prêmio do ranking (além de
-- perder 1% da comissão da semana — essa parte é cobrada fora do app).
-- Vira um terceiro piso, igual a valor_minimo e quantidade_minima: o
-- ranking continua numerando todo mundo por valor, e quem não bate algum
-- piso fica na posição SEM prêmio (o prêmio não passa pro próximo —
-- mesma regra de 21/08/2026, ver lib/vendaComplementar.ts).
--
-- Ofertados = soma de venda_complementar_oferta_diaria.clientes_ofertados
-- nos dias do período (autodeclarado pelo vendedor).
-- ============================================================

alter table campanhas_complementares
  add column if not exists ofertas_minimas_periodo integer
    check (ofertas_minimas_periodo > 0);

comment on column campanhas_complementares.ofertas_minimas_periodo is
  'Mínimo de clientes ofertados (soma do período) pra receber prêmio. Null = sem piso.';

-- vale pra campanha vigente (26/09 a 02/10) e as de outubro
update campanhas_complementares
set ofertas_minimas_periodo = 60
where data_fim >= date '2026-10-02';

select id, data_inicio, data_fim, valor_minimo, quantidade_minima, ofertas_minimas_periodo
from campanhas_complementares
where data_fim >= date '2026-10-02'
order by data_inicio;
