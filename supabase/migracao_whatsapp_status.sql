-- [12/08/2026] Botão de WhatsApp (Clientes, Clientes do Vendedor,
-- Alertas) hoje só valida FORMATO do telefone, não se o número tem
-- WhatsApp de verdade. Coluna nova pra guardar o resultado real, vindo
-- de uma checagem em lote contra a Evolution API (ver
-- coletor/evolution_verificar_whatsapp.n8n.json) — não dá pra checar
-- isso na hora, direto do app (exigiria expor a chave da API no
-- cliente).
--
-- NULL = ainda não checado (app cai pro fallback de validar só o
-- formato); TRUE/FALSE = resultado real da última checagem.
alter table clientes add column if not exists tem_whatsapp boolean;

create index if not exists idx_clientes_tem_whatsapp_pendente
  on clientes (codigo)
  where tem_whatsapp is null and fone is not null;
