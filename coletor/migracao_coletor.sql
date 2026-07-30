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
