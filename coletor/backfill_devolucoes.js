// Backfill ÚNICO — marca tipo_cancelamento='D' nas vendas já
// sincronizadas que tiveram DEVOLUÇÃO total, usando o endpoint
// /parcelas-cartao/estorno-v1 (achado 26/08/2026: devolução é um
// mecanismo DIFERENTE de estorno/exclusão — a nota original sincroniza
// normal via /venda/obter-alterados-v1, sem nenhum sinal de devolução;
// só esse endpoint separado, de parcelas de cartão, traz o vínculo
// numeroNotaDevolucao -> numeroNotaOrigem). O relatório "Totais por
// Vendedor" da Trier já desconta devolução ("VENDAS MENOS DEVOLUÇÕES"),
// por isso o app não batia mesmo depois de excluir estorno/cancelamento.
//
// tipo_cancelamento='D' reaproveita o mesmo campo/valor que a própria
// Trier documenta (docs/api-sgf-openapi.json, VendaIntegracaoDto.
// tipoCancelamento: "D=Devolução, E=Estorno") — todo filtro que já
// existe (`tipo_cancelamento is null` nas views/calcular_metricas_mes)
// passa a excluir devolução de graça, sem precisar mexer em mais nada.
//
// Só marca devolução TOTAL (totalNotaDevolucao == totalNotaOrigem) —
// devolução PARCIAL não deveria zerar a nota inteira, fica de fora até
// existir um jeito de abater só o item devolvido (nenhum caso parcial
// visto até agora, mas o código não assume que nunca vai acontecer).
//
// Só faz UPDATE em vendas que já existem (match por numero_nota +
// cod_filial) — não insere venda nova, não mexe em venda_itens.
// Idempotente: rodar de novo não duplica nem desfaz nada.
//
// Uso:
//   cd coletor && npm install
//   TRIER_TOKEN="..." DATABASE_URL="..." node backfill_devolucoes.js
//
// Opcionais: DATA_INICIAL (default '2026-01-01'), DATA_FINAL (default
// hoje), COD_FILIAL (default 1 — o endpoint não devolve cod_filial no
// payload, então assume a filial única já usada no resto do coletor).
'use strict';

const { Client } = require('pg');

const TRIER_TOKEN = process.env.TRIER_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;
const BASE_URL = process.env.TRIER_BASE_URL || 'https://api-sgf-gateway.triersistemas.com.br/sgfpod1/rest/integracao';
const DATA_INICIAL = process.env.DATA_INICIAL || '2026-01-01';
const DATA_FINAL = process.env.DATA_FINAL || new Date().toISOString().slice(0, 10);
const COD_FILIAL = process.env.COD_FILIAL ? Number(process.env.COD_FILIAL) : 1;

if (!TRIER_TOKEN) {
  console.error('Faltou TRIER_TOKEN (o mesmo Bearer da credencial "SGF Trier - Bearer" no n8n).');
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error('Faltou DATABASE_URL (connection string do Session Pooler do Supabase).');
  process.exit(1);
}

async function buscarTodasDevolucoes() {
  const QUANTIDADE = 999;
  let primeiroRegistro = 0;
  const linhas = [];
  for (;;) {
    const url = new URL(`${BASE_URL}/parcelas-cartao/estorno-v1`);
    url.searchParams.set('primeiroRegistro', String(primeiroRegistro));
    url.searchParams.set('quantidadeRegistros', String(QUANTIDADE));
    url.searchParams.set('dataEmissaoInicial', DATA_INICIAL);
    url.searchParams.set('dataEmissaoFinal', DATA_FINAL);

    const resposta = await fetch(url, { headers: { Authorization: `Bearer ${TRIER_TOKEN}` } });
    if (!resposta.ok) {
      throw new Error(`estorno-v1 -> HTTP ${resposta.status}: ${await resposta.text()}`);
    }
    const pagina = await resposta.json();
    const itens = Array.isArray(pagina.estornos) ? pagina.estornos : [];
    linhas.push(...itens);

    process.stdout.write(`\r  parcelas-cartao/estorno-v1: ${linhas.length} registro(s)...`);

    if (itens.length < QUANTIDADE) break;
    primeiroRegistro += QUANTIDADE;
  }
  process.stdout.write('\n');
  return linhas;
}

async function main() {
  console.log(`Período: ${DATA_INICIAL} até ${DATA_FINAL} (filial ${COD_FILIAL})\n`);

  console.log('Buscando devoluções na Trier...');
  const devolucoes = await buscarTodasDevolucoes();
  console.log(`Total: ${devolucoes.length} devolução(ões).\n`);

  if (devolucoes.length === 0) {
    console.log('Nada pra marcar.');
    return;
  }

  const totais = devolucoes.filter((d) => Math.abs(d.totalNotaDevolucao - d.totalNotaOrigem) < 0.01);
  const parciais = devolucoes.filter((d) => Math.abs(d.totalNotaDevolucao - d.totalNotaOrigem) >= 0.01);
  console.log(`Totais (marcam a nota inteira): ${totais.length}`);
  if (parciais.length > 0) {
    console.log(`Parciais (NÃO marcadas — precisa de tratamento à parte): ${parciais.length}`);
    for (const p of parciais) {
      console.log(`  nota ${p.numeroNotaOrigem}: original R$${p.totalNotaOrigem}, devolvido R$${p.totalNotaDevolucao}`);
    }
  }

  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  let marcados = 0;
  let naoEncontrados = 0;
  for (const d of totais) {
    const { rowCount } = await client.query(
      `update vendas set tipo_cancelamento = 'D', updated_at = now()
       where numero_nota = $1 and cod_filial = $2 and tipo_cancelamento is distinct from 'D'`,
      [d.numeroNotaOrigem, COD_FILIAL]
    );
    if (rowCount > 0) marcados += 1;
    else naoEncontrados += 1;
  }

  await client.end();

  console.log(`\nVendas marcadas como devolução (tipo_cancelamento='D'): ${marcados}`);
  console.log(`Devoluções sem venda correspondente no banco: ${naoEncontrados}`);
  if (naoEncontrados > 0) {
    console.log('  (normal se a venda original nunca sincronizou, ou se é de antes do período do backfill de vendas)');
  }
}

main().catch((erro) => {
  console.error('\nErro:', erro.message);
  process.exit(1);
});
