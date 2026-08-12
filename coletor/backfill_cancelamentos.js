// Backfill ÚNICO — marca tipo_cancelamento nas vendas já sincronizadas
// que são estorno/devolução, usando o endpoint dedicado
// /venda/cancelamento/obter-alterados-v1 (achado 12/08/2026:
// /venda/obter-alterados-v1, que o coletor usa pro dia a dia, NUNCA
// traz tipoCancelamento/numeroNotaOrigem preenchidos — só esse
// endpoint separado tem esse dado). Sem isso, as views corrigidas em
// migracao_exclui_estorno_desempenho.sql não mudam nada, porque o
// campo que elas filtram está 100% nulo na tabela.
//
// Só faz UPDATE em vendas que já existem (match por numero_nota +
// cod_filial) — não insere venda nova, não mexe em venda_itens.
// Idempotente: rodar de novo não duplica nem desfaz nada.
//
// Uso:
//   cd coletor && npm install
//   TRIER_TOKEN="..." DATABASE_URL="..." node backfill_cancelamentos.js
//
// Opcionais: DATA_INICIAL (default '2026-01-01T00:00:00-03:00', mesmo
// default de backfill_periodo.js), DATA_FINAL (default agora).
'use strict';

const { Client } = require('pg');

const TRIER_TOKEN = process.env.TRIER_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;
const BASE_URL = process.env.TRIER_BASE_URL || 'https://api-sgf-gateway.triersistemas.com.br/sgfpod1/rest/integracao';
const DATA_INICIAL = new Date(process.env.DATA_INICIAL || '2026-01-01T00:00:00-03:00');
const DATA_FINAL = process.env.DATA_FINAL ? new Date(process.env.DATA_FINAL) : new Date();

if (!TRIER_TOKEN) {
  console.error('Faltou TRIER_TOKEN (o mesmo Bearer da credencial "SGF Trier - Bearer" no n8n).');
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error('Faltou DATABASE_URL (connection string do Session Pooler do Supabase).');
  process.exit(1);
}

function formatarDataTrier(dataUtc) {
  const brasilia = new Date(dataUtc.getTime() - 3 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${brasilia.getUTCFullYear()}-${pad(brasilia.getUTCMonth() + 1)}-${pad(brasilia.getUTCDate())}` +
    `T${pad(brasilia.getUTCHours())}:${pad(brasilia.getUTCMinutes())}:${pad(brasilia.getUTCSeconds())}-0300`
  );
}

function dormir(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function buscarTudo(caminho, paramsExtras = {}) {
  const QUANTIDADE = 999;
  let primeiroRegistro = 0;
  const linhas = [];
  for (;;) {
    const url = new URL(`${BASE_URL}${caminho}`);
    url.searchParams.set('primeiroRegistro', String(primeiroRegistro));
    url.searchParams.set('quantidadeRegistros', String(QUANTIDADE));
    for (const [chave, valor] of Object.entries(paramsExtras)) {
      url.searchParams.set(chave, valor);
    }

    const resposta = await fetch(url, { headers: { Authorization: `Bearer ${TRIER_TOKEN}` } });
    if (!resposta.ok) {
      throw new Error(`${caminho} -> HTTP ${resposta.status}: ${await resposta.text()}`);
    }
    const pagina = await resposta.json();
    const itens = Array.isArray(pagina) ? pagina : [];
    linhas.push(...itens);

    process.stdout.write(`\r  ${caminho}: ${linhas.length} registro(s)...`);

    if (itens.length < QUANTIDADE) break;
    primeiroRegistro += QUANTIDADE;
    await dormir(150);
  }
  process.stdout.write('\n');
  return linhas;
}

async function main() {
  const dataInicialStr = formatarDataTrier(DATA_INICIAL);
  const dataFinalStr = formatarDataTrier(DATA_FINAL);
  console.log(`Período: ${dataInicialStr} até ${dataFinalStr}\n`);

  console.log('Buscando cancelamentos na Trier...');
  const cancelamentos = await buscarTudo('/venda/cancelamento/obter-alterados-v1', {
    dataInicial: dataInicialStr,
    dataFinal: dataFinalStr,
  });
  console.log(`Total: ${cancelamentos.length} cancelamento(s).\n`);

  if (cancelamentos.length === 0) {
    console.log('Nada pra marcar.');
    return;
  }

  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  let marcados = 0;
  let naoEncontrados = 0;
  for (const c of cancelamentos) {
    const { rowCount } = await client.query(
      `update vendas set tipo_cancelamento = $1, updated_at = now()
       where numero_nota = $2 and cod_filial = $3 and tipo_cancelamento is distinct from $1`,
      [c.tipoCancelamento ?? 'E', c.numeroNota, c.codFilial]
    );
    if (rowCount > 0) marcados += 1;
    else naoEncontrados += 1;
  }

  await client.end();

  console.log(`Vendas marcadas (tipo_cancelamento atualizado): ${marcados}`);
  console.log(`Cancelamentos sem venda correspondente no banco: ${naoEncontrados}`);
  if (naoEncontrados > 0) {
    console.log('  (normal se a venda original nunca sincronizou, ou se é de antes do período do backfill de vendas)');
  }
}

main().catch((erro) => {
  console.error('\nErro:', erro.message);
  process.exit(1);
});
