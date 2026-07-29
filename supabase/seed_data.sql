-- ============================================================
-- SEED DE DADOS — dados fictícios para desenvolvimento/testes.
--
-- Roda em cima do schema já aplicado (supabase/schema.sql +
-- supabase/rls_policies.sql). Popula:
--   - 2 vendedores (codigo 201, 202)
--   - ~150 clientes
--   - 16 produtos curados (promoção / exige receita)
--   - ~350 vendas (5 meses de histórico)
--   - itens de venda (derivados das vendas, ~3 por nota em média;
--     ~35% deles usando de propósito os códigos dos produtos
--     curados, pra Alertas/Receitas terem dado de verdade)
--   - vendas_vendedor_diario (agregado, com ruído proposital em
--     relação ao que dá pra recalcular a partir de vendas/itens —
--     replica a divergência real entre duas fontes da mesma API)
--   - venda_item_receitas (parte dos itens controlados já com
--     receita anexada, parte pendente — igual fila real)
--
-- Inclui inconsistências propositais para o app/telas terem que
-- lidar com casos reais de sujeira de dados:
--   - clientes sem CPF, sem e-mail, sem CEP
--   - vendas sem cliente identificado (venda avulsa)
--   - vendas sem vendedor atribuído
--   - vendas canceladas (sem itens, não entram no faturamento)
--   - item de venda com vendedor diferente do vendedor da nota
--   - desconto aplicado acima do desconto máximo cadastrado
--   - pequena divergência entre vendas_vendedor_diario e a soma
--     real de vendas/venda_itens
--
-- Idempotente: pode rodar mais de uma vez sem duplicar linhas
-- (usa ON CONFLICT DO NOTHING nas tabelas com chave natural fixa).
-- Para recomeçar do zero, rode primeiro o bloco de TRUNCATE no
-- final deste arquivo (comentado por padrão).
--
-- NÃO mexe em sync_control (é controle do coletor real; esses
-- dados não vieram da API da Trier, então não devem ser marcados
-- como "sincronizados").
-- ============================================================

-- ============================================================
-- 1) VENDEDORES
-- ============================================================
insert into vendedores (codigo, nome, numero_cpf, cep, email, ativo) values
  (201, 'João Mendes',   '111.222.333-01', '01310-100', 'joao.mendes@farmapp.com',   true),
  (202, 'Camila Duarte', '222.333.444-02', '04543-000', 'camila.duarte@farmapp.com', true)
on conflict (codigo) do nothing;

-- ============================================================
-- 2) CLIENTES (~150, com sujeira de dados proposital)
-- ============================================================
do $$
declare
  primeiros text[] := array['Maria','José','Ana','João','Antônio','Francisca','Carlos','Paulo','Pedro',
    'Lucas','Marcos','Luiz','Gabriel','Rafael','Daniel','Marcelo','Bruno','Eduardo','Felipe','Rodrigo',
    'Fernanda','Juliana','Camila','Aline','Patrícia','Renata','Vanessa','Beatriz','Larissa','Amanda',
    'Priscila','Tatiane','Simone','Débora','Cristina','Sandra','Roberta','Adriana','Sônia','Rosa'];
  sobrenomes text[] := array['Silva','Santos','Oliveira','Souza','Rodrigues','Ferreira','Alves','Pereira',
    'Lima','Gomes','Costa','Ribeiro','Martins','Carvalho','Almeida','Lopes','Soares','Fernandes','Vieira',
    'Barbosa','Rocha','Dias','Nunes','Mendes','Moreira','Nascimento','Araújo','Correia','Cardoso','Teixeira'];
  bairros text[] := array['Centro','Jardim América','Vila Nova','Boa Vista','São José','Distrito Industrial',
    'Bela Vista','Santa Cruz','Alto da Boa Vista','Parque das Flores'];
  total int := 150;
  i int;
  nome text;
begin
  for i in 1..total loop
    nome := primeiros[1 + floor(random() * array_length(primeiros, 1))::int]
      || ' ' || sobrenomes[1 + floor(random() * array_length(sobrenomes, 1))::int];

    insert into clientes (
      codigo, nome, numero_cpf_cnpj, codigo_cidade, email, cep, estado,
      fone, bairro, logradouro, numero_endereco, ativo, grupo, empresa_convenio
    ) values (
      1000 + i,
      nome,
      case when random() < 0.06 then null                                   -- ~6% sem CPF cadastrado
           else lpad((random() * 99999999999)::bigint::text, 11, '0') end,
      '3550308', -- código IBGE fixo (São Paulo) para simplificar
      case when random() < 0.30 then null                                   -- ~30% sem e-mail
           else lower(translate(nome, 'áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ ', 'aaaaeeiooouc AAAAEEIOOOUC')) || i || '@example.com' end,
      case when random() < 0.15 then null else lpad((random() * 99999999)::bigint::text, 8, '0') end,
      'SP',
      case when random() < 0.20 then null else '(11) 9' || lpad((random() * 99999999)::bigint::text, 8, '0') end,
      bairros[1 + floor(random() * array_length(bairros, 1))::int],
      'Rua ' || sobrenomes[1 + floor(random() * array_length(sobrenomes, 1))::int],
      (1 + floor(random() * 2000))::text,
      random() < 0.92, -- ~8% marcados como inativos no cadastro
      case when random() < 0.10 then jsonb_build_object('codigo', 1, 'descricao', 'Convênio Farmácia Popular') else null end,
      case when random() < 0.05 then jsonb_build_object('codigo', 1, 'nome', 'Empresa Convênio XYZ Ltda') else null end
    )
    on conflict (codigo) do nothing;
  end loop;
end $$;

-- ============================================================
-- 3) PRODUTOS (16 curados — promoção e/ou exige receita)
-- Mesma lista usada no mock do app (app/src/data/mock/seed.ts),
-- pra dashboard mockado e dados reais contarem a mesma história.
-- ============================================================
insert into produtos (codigo, nome, preco_atual, preco_anterior, em_promocao, percentual_desconto, exige_receita, tipo_receita) values
  (1001, 'Dipirona 500mg',          8.90,  null,  false, null, false, null),
  (1002, 'Paracetamol 750mg',       7.14,  8.40,  true,  15,   false, null),
  (1003, 'Amoxicilina 500mg',       24.90, null,  false, null, true,  'antimicrobiano'),
  (1004, 'Losartana 50mg',          15.21, 16.90, true,  10,   true,  'comum'),
  (1005, 'Omeprazol 20mg',          12.50, null,  false, null, false, null),
  (1006, 'Rivotril 2mg',            32.40, null,  false, null, true,  'controle_especial'),
  (1007, 'Protetor Solar FPS 50',   47.92, 59.90, true,  20,   false, null),
  (1008, 'Vitamina C 1g',           18.68, 24.90, true,  25,   false, null),
  (1009, 'Metformina 850mg',        14.30, null,  false, null, true,  'comum'),
  (1010, 'Sertralina 50mg',         28.71, 31.90, true,  10,   true,  'controle_especial'),
  (1011, 'Fralda Geriátrica G',     33.91, 39.90, true,  15,   false, null),
  (1012, 'Shampoo Anticaspa',       22.50, null,  false, null, false, null),
  (1013, 'Azitromicina 500mg',      26.60, 28.00, true,  5,    true,  'antimicrobiano'),
  (1014, 'Multivitamínico',         20.93, 29.90, true,  30,   false, null),
  (1015, 'Insulina NPH',            45.00, null,  false, null, true,  'controle_especial'),
  (1016, 'Colírio Lubrificante',    16.20, null,  false, null, false, null)
on conflict (codigo) do nothing;

-- ============================================================
-- 4) VENDAS + ITENS (~350 notas, últimos 5 meses)
-- ============================================================
do $$
declare
  vendedores int[] := array[201, 202];
  produtos_curados int[] := array[1001,1002,1003,1004,1005,1006,1007,1008,1009,1010,1011,1012,1013,1014,1015,1016];
  qtd_clientes int := 150;
  total_vendas int := 350;
  i int;
  j int;
  v_id bigint;
  v_data date;
  v_vendedor int;
  v_cliente int;
  v_canal_rand numeric;
  v_ifood boolean;
  v_ecommerce boolean;
  v_cancelado boolean;
  v_tipo_cancelamento text;
  n_itens int;
  item_vendedor int;
  codigo_prod int;
  qtd_prod numeric;
  vlr_unit numeric;
  vlr_bruto numeric;
  prc_desc numeric;
  prc_desc_max numeric;
  vlr_desc numeric;
  vlr_liq numeric;
  vlr_custo numeric;
begin
  for i in 1..total_vendas loop
    v_data := current_date - floor(random() * 150)::int; -- ~5 meses de histórico
    v_vendedor := case when random() < 0.02 then null -- ~2%: venda sem vendedor atribuído (falha de integração)
                        else vendedores[1 + floor(random() * array_length(vendedores, 1))::int] end;
    v_cliente := case when random() < 0.10 then null -- ~10%: venda avulsa, sem cliente identificado
                       else 1000 + 1 + floor(random() * qtd_clientes)::int end;

    v_canal_rand := random();
    v_ifood := v_canal_rand < 0.15;
    v_ecommerce := (not v_ifood) and v_canal_rand < 0.30;

    v_cancelado := random() < 0.04; -- ~4% de cancelamento
    v_tipo_cancelamento := case when v_cancelado
      then (array['CANCELAMENTO_CLIENTE', 'CANCELAMENTO_ERRO_OPERACIONAL', 'CANCELAMENTO_FISCAL'])[1 + floor(random() * 3)::int]
      else null end;

    insert into vendas (
      numero_nota, numero_nota_origem, tipo_cancelamento, data_emissao, hora_emissao,
      codigo_vendedor, codigo_cliente, entrega, pagamento_na_entrega, condicao_pagamento,
      vlr_troco, numero_cupom_fiscal, numero_nota_fiscal, cod_parceiro, cod_filial,
      venda_ifood, venda_ecommerce, cod_ecommerce, ser_nota_fiscal, modelo_venda, dados_entrega
    ) values (
      1000 + i,
      null,
      v_tipo_cancelamento,
      v_data,
      (time '08:00:00' + (random() * interval '11 hours'))::time,
      v_vendedor,
      v_cliente,
      random() < 0.10,
      random() < 0.05,
      jsonb_build_object(
        'tipo', (array['dinheiro', 'credito', 'debito', 'pix'])[1 + floor(random() * 4)::int],
        'parcelas', 1 + floor(random() * 6)::int
      ),
      round((random() * 8)::numeric, 2),
      1000 + i,
      1000 + i,
      null,
      1,
      v_ifood,
      v_ecommerce,
      case when v_ecommerce then 'ECM' || (1000 + i) else null end,
      '1',
      'NFCE',
      case when random() < 0.10 then jsonb_build_object('endereco', 'Rua Exemplo, ' || i, 'previsao', (v_data + 1)::text) else null end
    )
    on conflict (numero_nota, cod_filial, ser_nota_fiscal) do nothing
    returning id into v_id;

    -- vendas canceladas ficam só com o cabeçalho (sem itens), como
    -- acontece em vários PDVs reais — não entram no faturamento.
    if v_id is not null and not v_cancelado and v_vendedor is not null then
      n_itens := 1 + floor(random() * 5)::int; -- 1 a 5 itens por nota

      for j in 1..n_itens loop
        -- ~3% dos itens registrados com um vendedor diferente do
        -- vendedor da nota (troca de atendente no meio da venda).
        item_vendedor := case when random() < 0.03
          then vendedores[1 + floor(random() * array_length(vendedores, 1))::int]
          else v_vendedor end;

        -- ~35% dos itens usa de propósito um código de produto curado
        -- (produtos.codigo), pra Alertas/Receitas terem dado de verdade;
        -- o resto simula o catálogo geral (fora da curadoria).
        codigo_prod := case when random() < 0.35
          then produtos_curados[1 + floor(random() * array_length(produtos_curados, 1))::int]
          else 1000 + floor(random() * 400)::int end;

        qtd_prod := round((1 + random() * 4)::numeric, 3);
        vlr_unit := round((5 + random() * 115)::numeric, 2);
        vlr_bruto := round((qtd_prod * vlr_unit)::numeric, 2);
        prc_desc_max := round((random() * 20)::numeric, 3);
        prc_desc := case
          when random() < 0.05 then round((prc_desc_max + random() * 10)::numeric, 3) -- ~5%: desconto acima do máximo permitido (inconsistência)
          else round((random() * prc_desc_max)::numeric, 3)
        end;
        vlr_desc := round((vlr_bruto * prc_desc / 100)::numeric, 2);
        vlr_liq := vlr_bruto - vlr_desc;
        vlr_custo := round((vlr_bruto * (0.4 + random() * 0.3))::numeric, 2);

        insert into venda_itens (
          venda_id, codigo_produto, codigo_vendedor, quantidade_produtos,
          valor_total_bruto, valor_total_liquido, valor_total_custo, parceiro,
          codigo_medico, cod_barras, num_sequencial, prc_comissao, vlr_desconto,
          vlr_unitario, vlr_custo_aquisicao, vlr_custo_produto, tabela_desconto,
          prc_desconto, prc_desconto_max, venda_com_desconto
        ) values (
          v_id,
          codigo_prod,
          item_vendedor,
          qtd_prod,
          vlr_bruto,
          vlr_liq,
          vlr_custo,
          null,
          null,
          lpad((random() * 9999999999999::bigint)::bigint::text, 13, '0'),
          j,
          round((1 + random() * 4)::numeric, 3),
          vlr_desc,
          vlr_unit,
          round((vlr_custo / greatest(qtd_prod, 0.001))::numeric, 2),
          vlr_custo,
          case when prc_desc > 0 then 'PADRAO' else null end,
          prc_desc,
          prc_desc_max,
          prc_desc > 0
        );
      end loop;
    end if;
  end loop;
end $$;

-- ============================================================
-- 5) VENDAS_VENDEDOR_DIARIO
-- Recalcula a partir das vendas/itens gerados acima, mas aplica
-- um ruído pequeno e proposital em parte dos dias — no sistema
-- real esse endpoint é uma fonte separada da API (atendimentos
-- diário) e pode divergir um pouco do que dá pra somar em
-- vendas/venda_itens (a mesma inconsistência que o app vai ter
-- que soportar quando os dados forem reais).
-- ============================================================
insert into vendas_vendedor_diario (data_emissao, codigo_vendedor, quantidade_itens, quantidade_atendimentos)
select
  agg.data_emissao,
  agg.codigo_vendedor,
  greatest(0, agg.quantidade_itens + case when random() < 0.20 then (floor(random() * 5) - 2)::int else 0 end),
  greatest(0, agg.quantidade_atendimentos + case when random() < 0.10 then (floor(random() * 3) - 1)::int else 0 end)
from (
  select
    vd.data_emissao,
    vd.codigo_vendedor,
    count(distinct vd.id) as quantidade_atendimentos,
    coalesce(sum(itens.qtd_itens), 0)::int as quantidade_itens
  from vendas vd
  left join (
    select venda_id, count(*) as qtd_itens
    from venda_itens
    group by venda_id
  ) itens on itens.venda_id = vd.id
  where vd.codigo_vendedor is not null
  group by vd.data_emissao, vd.codigo_vendedor
) agg
on conflict (data_emissao, codigo_vendedor) do update
  set quantidade_itens = excluded.quantidade_itens,
      quantidade_atendimentos = excluded.quantidade_atendimentos;

-- ============================================================
-- 6) VENDA_ITEM_RECEITAS
-- ~45% dos itens de produtos controlados já nascem com receita
-- anexada (fila resolvida); o resto fica pendente de propósito —
-- é exatamente a fila que a tela "Receitas" do app deve mostrar.
-- foto_url fica null (não temos foto real pra anexar no seed) e
-- anexado_por fica null (os usuários de Auth só existem depois de
-- rodar supabase/seed_profiles.sql).
--
-- Seleção por (vi.id % 100) em vez de random() de propósito: assim
-- o conjunto escolhido é sempre o mesmo em toda execução (idempotente
-- de verdade), em vez de "completar" mais receitas a cada vez que o
-- script roda de novo.
-- ============================================================
insert into venda_item_receitas (venda_item_id, tipo_receita, foto_url, data_anexo)
select
  vi.id,
  p.tipo_receita,
  null,
  (v.data_emissao::timestamptz + interval '1 day' + ((vi.id % 6) * interval '1 hour'))
from venda_itens vi
join produtos p on p.codigo = vi.codigo_produto and p.exige_receita = true
join vendas v on v.id = vi.venda_id
where (vi.id % 100) < 45
on conflict (venda_item_id) do nothing;

-- ============================================================
-- 7) METAS (mês corrente) — mensal + 4 buckets semanais, pros 2
-- vendedores. Valores fictícios de exemplo; o gestor edita pela
-- tela "Metas" do app (que faz upsert nesta mesma tabela).
-- ============================================================
do $$
declare
  ano_atual int := extract(year from current_date)::int;
  mes_atual int := extract(month from current_date)::int;
begin
  insert into metas (codigo_vendedor, ano, mes, semana, valor_meta) values
    (201, ano_atual, mes_atual, null, 70000),
    (201, ano_atual, mes_atual, 1,    16000),
    (201, ano_atual, mes_atual, 2,    17000),
    (201, ano_atual, mes_atual, 3,    17000),
    (201, ano_atual, mes_atual, 4,    20000),
    (202, ano_atual, mes_atual, null, 85000),
    (202, ano_atual, mes_atual, 1,    20000),
    (202, ano_atual, mes_atual, 2,    20000),
    (202, ano_atual, mes_atual, 3,    21000),
    (202, ano_atual, mes_atual, 4,    24000)
  on conflict do nothing;
end $$;

-- ============================================================
-- 8) PRODUTO_CATALOGO — mesmo catálogo usado no mock do app
-- (app/src/data/mock/seed.ts), pra Campanhas/Cartazetes terem dado
-- de verdade também no Supabase. Os 5 últimos (Fralda Pampers Pants
-- Giga) usam os códigos de barra reais do docs/txt.txt de propósito.
-- ============================================================
insert into produto_catalogo (codigo, codigo_barras, nome, categoria, marca, preco_venda, custo_medio, estoque_atual) values
  (2001, '7891058109254', 'Dipirona Gotas 10ml', 'Medicamentos', 'EMS', 9.90, 5.20, 120),
  (2002, '7896004704507', 'Vitamina D3 2000UI 60cáps', 'Suplementos', 'Sundown', 42.90, 22.00, 35),
  (2003, '7891350037773', 'Protetor Solar FPS70 120ml', 'Dermocosméticos', 'Sundown', 68.90, 38.00, 18),
  (2004, '7500435123456', 'Escova Dental Macia', 'Higiene Bucal', 'Oral-B', 12.50, 6.00, 200),
  (2005, '7891024131253', 'Fio Dental 50m', 'Higiene Bucal', 'Colgate', 8.90, 4.10, 150),
  (2006, '7896098900014', 'Álcool Gel 500ml', 'Higiene', 'Asfar', 14.90, 7.50, 90),
  (2007, '7891010511016', 'Curativo Band-Aid 20un', 'Primeiros Socorros', 'J&J', 15.90, 8.00, 60),
  (2008, '7898950627148', 'Termômetro Digital', 'Equipamentos', 'G-Tech', 29.90, 16.00, 25),
  (2009, '7898930910019', 'Colágeno Hidrolisado 300g', 'Suplementos', 'Nutrated', 79.90, 45.00, 12),
  (2010, '7891350900718', 'Sabonete Líquido Íntimo 200ml', 'Higiene', 'Nívea', 24.90, 13.00, 40),
  (2011, '7896183301024', 'Repelente Spray 100ml', 'Dermocosméticos', 'Exposis', 34.90, 19.00, 22),
  (2012, '7891350031733', 'Creme Hidratante Corporal 400ml', 'Dermocosméticos', 'Nívea', 32.90, 17.50, 55),
  (2013, '7891010131207', 'Absorvente Noturno 8un', 'Higiene', 'Sempre Livre', 11.90, 6.00, 130),
  (2014, '7500435228756', 'Shampoo Anticaspa 200ml', 'Cabelos', 'Head & Shoulders', 27.90, 15.00, 44),
  (2015, '7500435228763', 'Condicionador Reparador 200ml', 'Cabelos', 'Pantene', 26.90, 14.50, 38),
  (2016, '3700010123456', 'Multivitamínico Infantil 30un', 'Suplementos', 'Centrum', 45.90, 27.00, 8),
  (2017, '7896422500019', 'Ibuprofeno 400mg 20cp', 'Medicamentos', 'Medley', 18.90, 10.50, 70),
  (2018, '7896004700141', 'Omeprazol 20mg 28cp', 'Medicamentos', 'EMS', 16.90, 9.00, 90),
  (2019, '7891106902013', 'Colírio Lubrificante 15ml', 'Medicamentos', 'Allergan', 22.90, 12.00, 30),
  (2020, '7891150017525', 'Sabonete Barra Dermatológico 90g', 'Dermocosméticos', 'Dove', 6.90, 3.20, 180),
  (2021, '7891350029210', 'Protetor Labial FPS15', 'Dermocosméticos', 'Nívea', 9.90, 4.50, 65),
  (2022, '7896183401021', 'Fralda Geriátrica G 8un', 'Higiene', 'Bigfral', 38.90, 24.00, 15),
  (2023, '3401390232017', 'Água Micelar 200ml', 'Dermocosméticos', 'Bioderma', 89.90, 55.00, 6),
  (2024, '7896336090011', 'Whey Protein 900g', 'Suplementos', 'Growth', 129.90, 78.00, 10),
  (2025, '7500435146470', 'Fralda Pampers Pants Giga M84', 'Bebês', 'Pampers', 94.90, 62.00, 20),
  (2026, '7500435146487', 'Fralda Pampers Pants Giga G72', 'Bebês', 'Pampers', 94.90, 62.00, 18),
  (2027, '7500435146494', 'Fralda Pampers Pants Giga XG66', 'Bebês', 'Pampers', 94.90, 62.00, 14),
  (2028, '7500435146500', 'Fralda Pampers Pants Giga XXG60', 'Bebês', 'Pampers', 94.90, 62.00, 9),
  (2029, '7500435246637', 'Fralda Pampers Pants Giga XXXG54', 'Bebês', 'Pampers', 94.90, 62.00, 5)
on conflict (codigo) do nothing;

-- ============================================================
-- 9) CAMPANHA DE EXEMPLO — replica o cartaz/txt de referência
-- (docs/txt.txt): as 5 fraldas Pampers Pants Giga a R$83,99, válida
-- por 2 dias. Idempotente via "on conflict do nothing" na campanha
-- (pelo nome) e nos itens (pela unique campanha_id+codigo_produto).
-- ============================================================
do $$
declare
  v_campanha_id bigint;
begin
  insert into campanhas (nome, data_inicio, data_fim)
  select 'Fralda Pampers Pants Giga', date '2026-07-30', date '2026-07-31'
  where not exists (select 1 from campanhas where nome = 'Fralda Pampers Pants Giga')
  returning id into v_campanha_id;

  if v_campanha_id is not null then
    insert into campanha_produtos (campanha_id, codigo_produto, preco_promocional, percentual_desconto, quantidade_cartazes)
    select v_campanha_id, codigo, 83.99, round((1 - 83.99 / preco_venda) * 100, 2), 1
    from produto_catalogo
    where codigo between 2025 and 2029;
  end if;
end $$;

-- ============================================================
-- Para recomeçar do zero (CUIDADO — apaga os dados de negócio):
-- ============================================================
-- truncate table campanha_produtos, campanhas, produto_catalogo, metas, venda_item_receitas, vendas_vendedor_diario, venda_itens, vendas, produtos, clientes, vendedores restart identity cascade;
