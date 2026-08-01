-- ============================================================
-- LIMPEZA — remove os dados fictícios de supabase/seed_data.sql
-- que foram aplicados no projeto Supabase REAL no início do
-- projeto e nunca foram removidos. Achado ao investigar por que o
-- faturamento líquido mensal (R$307.814,92) não batia com o
-- relatório real da Trier (R$267.046,20): os vendedores fake 201
-- "João Mendes" e 202 "Camila Duarte" estavam somando R$36.115,96
-- e 72 notas ao total.
--
-- Rode o bloco de VERIFICAÇÃO primeiro (só leitura) pra conferir
-- que as contagens batem com o esperado antes do DELETE:
--   vendas fake = 350, clientes fake = 150, vendedores fake = 2,
--   produtos fake = 16, produto_catalogo fake = 29, campanhas = 1,
--   auth.users fake = 2 (ou 0, se essas contas nunca chegaram a
--   ser criadas no Auth).
-- ============================================================

-- ---------- VERIFICAÇÃO (rode antes, só leitura) ----------
select 'vendas fake' as tabela, count(*) from vendas
  where numero_nota between 1001 and 1350 and cod_filial = 1 and ser_nota_fiscal = '1'
union all
select 'clientes fake', count(*) from clientes c
  where c.codigo between 1001 and 1150
    and not exists (
      select 1 from vendas v
      where v.codigo_cliente = c.codigo
        and not (v.numero_nota between 1001 and 1350 and v.cod_filial = 1 and v.ser_nota_fiscal = '1')
    )
union all
select 'vendedores fake', count(*) from vendedores where codigo in (201, 202)
union all
select 'vendas_vendedor_diario fake', count(*) from vendas_vendedor_diario where codigo_vendedor in (201, 202)
union all
select 'metas fake', count(*) from metas where codigo_vendedor in (201, 202)
union all
select 'produtos fake (curadoria)', count(*) from produtos where codigo between 1001 and 1016
union all
select 'produto_catalogo fake', count(*) from produto_catalogo where codigo between 2001 and 2029
union all
select 'campanhas fake', count(*) from campanhas where nome = 'Fralda Pampers Pants Giga'
union all
select 'auth.users fake', count(*) from auth.users where email in ('joao.mendes@farmapp.com', 'camila.duarte@farmapp.com');

-- ============================================================
-- LIMPEZA — ordem importa por causa das foreign keys.
-- ============================================================

-- 1) Contas de login fake. profiles.id referencia auth.users(id)
--    "on delete cascade", então a linha em profiles some junto.
delete from auth.users
where email in ('joao.mendes@farmapp.com', 'camila.duarte@farmapp.com');

-- 2) Vendas fake (numero_nota 1001-1350, cod_filial 1, ser_nota_fiscal '1'
--    — padrão exato gerado pelo seed, não colide com numero_nota real
--    da Trier). Cascade automático apaga venda_itens e
--    venda_item_receitas ("on delete cascade" em ambos).
delete from vendas
where numero_nota between 1001 and 1350
  and cod_filial = 1
  and ser_nota_fiscal = '1';

-- 3) Atendimentos diários fake — fonte separada, não é cascade de vendas.
delete from vendas_vendedor_diario
where codigo_vendedor in (201, 202);

-- 4) Metas fake dos vendedores fake.
delete from metas
where codigo_vendedor in (201, 202);

-- 5) Vendedores fake — só funciona depois dos passos 1 e 2 (profiles e
--    vendas ainda referenciando o codigo bloqueariam o delete).
delete from vendedores
where codigo in (201, 202);

-- 6) Clientes fake (codigo 1001-1150) — MAS o codigo sozinho não é
--    seguro: clientes reais da Trier também caem nesse intervalo, e o
--    upsert do backfill já sobrescreveu qualquer linha fake cujo
--    codigo coincidisse com um cliente real (foi o que deu o erro de
--    FK na primeira tentativa, cliente 1021 ainda referenciado por
--    venda real). O filtro certo: só apaga quem está no intervalo E
--    não é mais referenciado por nenhuma venda (vendas fake já foram
--    apagadas no passo 2, então qualquer referência restante é real).
--    Risco residual aceito: um cliente real sem nenhuma compra no
--    período importado (01/01/26-hoje) seria apagado aqui também —
--    recuperável rodando de novo `ENTIDADES=cliente node backfill_periodo.js`.
delete from clientes c
where c.codigo between 1001 and 1150
  and not exists (select 1 from vendas v where v.codigo_cliente = c.codigo);

-- 7) Campanha de demonstração ("Fralda Pampers Pants Giga"). Cascade
--    automático apaga campanha_produtos ("on delete cascade").
delete from campanhas
where nome = 'Fralda Pampers Pants Giga';

-- 8) Catálogo de produtos de demonstração (codigo 2001-2029).
delete from produto_catalogo
where codigo between 2001 and 2029;

-- 9) Produtos curados de demonstração — promoção/receita (codigo 1001-1016).
delete from produtos
where codigo between 1001 and 1016;
