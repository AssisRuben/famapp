-- ============================================================
-- Migração necessária ANTES de rodar o workflow do coletor
-- (coletor/sgf-incremental.n8n.json). Rodar no SQL Editor do
-- projeto Supabase real (ggzuchqfepjbsyadfcnk), depois de
-- schema.sql + rls_policies.sql já aplicados.
--
-- Motivo de cada mudança: comparando o schema atual com os DTOs
-- REAIS da API SGF (docs/api-sgf-openapi.json, agora que o acesso
-- foi liberado — ver README "Status atual / pendências").
-- ============================================================

-- 1) venda_itens não tem nenhuma constraint única — o upsert do
-- coletor (ON CONFLICT) precisa de uma pra não duplicar item toda
-- vez que a venda é resincronizada. num_sequencial (posição do item
-- dentro da nota) é a chave natural por venda.
--
-- ATENÇÃO: num_sequencial é nullable na API ("nullable": true no
-- DTO). Constraint única do Postgres trata cada NULL como distinto
-- (não bloqueia duplicata de NULL) — mesmo comportamento já usado
-- de propósito em `metas` (ver comentário em schema.sql). Se algum
-- item chegar sem num_sequencial, ele vai duplicar a cada sync; não
-- resolvido aqui porque não temos ainda um caso real de dado assim
-- pra confirmar como tratar.
alter table venda_itens
  add constraint venda_itens_venda_num_sequencial_unique
  unique (venda_id, num_sequencial);

-- 2) venda_com_desconto: schema.sql tem BOOLEAN, mas o DTO real
-- (VendaItemIntegracaoDto.vendaComDesconto) é NUMBER — "Valor da
-- venda considerando o desconto (4 casas decimais)", não um
-- indicador true/false. O workflow do coletor faz um mapeamento
-- provisório (TRUE se veio preenchido e diferente do valor líquido)
-- só pra não quebrar o insert — perde a informação do valor real.
--
-- Descomente e rode quando validar que faz sentido guardar o valor:
-- alter table venda_itens rename column venda_com_desconto to venda_com_desconto_old;
-- alter table venda_itens add column venda_com_desconto numeric(12,4);
-- -- (o coletor precisa ser atualizado pra gravar o número em vez do boolean antes disso)
-- alter table venda_itens drop column venda_com_desconto_old;

-- 3) venda_ecommerce: schema.sql tem BOOLEAN; o DTO manda STRING
-- ("S" ou null), não boolean. O coletor já mapeia vendaEcommerce
-- === 'S' pro boolean na escrita — schema não precisa mudar, só
-- documentando aqui pra não confundir quem for debugar diferença
-- entre o payload cru da API e o que cai na tabela.

-- 4) BUG REAL ENCONTRADO EM PRODUÇÃO (31/07/2026): nota fiscal sem
-- ser_nota_fiscal (comum — 3242 vendas duplicadas encontradas num único
-- dia, 30/07) nunca "batia" no ON CONFLICT (numero_nota, cod_filial,
-- ser_nota_fiscal), porque Postgres trata todo NULL como distinto de
-- qualquer outro NULL — cada reprocessamento duplicava a venda inteira
-- em vez de atualizar. Índice parcial cobre exatamente esse caso;
-- venda_itens não precisou de índice novo — o workflow e o
-- backfill_periodo.js passaram a sintetizar num_sequencial a partir da
-- posição no array quando a API não manda um, então a constraint
-- (venda_id, num_sequencial) já existente nunca mais recebe NULL.
--
-- ORDEM IMPORTA: limpa a duplicata primeiro, senão o CREATE UNIQUE
-- INDEX abaixo falha (Postgres não cria índice único sobre dado que já
-- viola a unicidade).
--
-- delete from vendas
-- where id in (
--   select id from (
--     select id, row_number() over (partition by numero_nota, cod_filial order by id) as rn
--     from vendas
--     where ser_nota_fiscal is null
--   ) t
--   where rn > 1
-- );

-- Rodar isso ANTES de reativar o coletor incremental ou rodar o
-- backfill de novo — sem o índice, INSERT de venda sem série ainda
-- funciona (só não trava a duplicação), mas com o índice e sem essa
-- migração o coletor passaria a dar erro em vez de duplicar.
create unique index if not exists vendas_numero_filial_unique_sem_serie
on vendas (numero_nota, cod_filial)
where ser_nota_fiscal is null;
