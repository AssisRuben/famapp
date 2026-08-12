// Script de comparação, SÓ LEITURA — não grava nada na Trier nem no
// Supabase. Feito pra investigar por que o total de vendas do app não
// bate com o relatório "Totais por Vendedor" da Trier (achado
// 12/08/2026): nosso banco tinha MAIS vendas e MAIS valor que a Trier
// pro mesmo período/filial, espalhado em vários vendedores, sem
// nenhuma marcação de cancelamento/devolução nos dados sincronizados.
//
// O que faz:
//   1. Busca as vendas cru da API (/venda/obter-alterados-v1), com
//      paginação de verdade, e conta quantas trazem tipoCancelamento
//      ou numeroNotaOrigem preenchidos ANTES de qualquer mapeamento do
//      coletor — isolando se o campo nunca vem da API ou se o coletor
//      está perdendo o dado no caminho.
//   2. Busca também /venda/cancelamento/obter-alterados-v1 pro mesmo
//      período, pra ver se o endpoint dedicado devolve algo.
//   3. Lê o que está no Supabase pro mesmo período/filial.
//   4. Cruza os dois lados: notas na Trier que não estão no banco
//      (perdidas pelo coletor) e notas no banco que não vieram nessa
//      chamada da Trier (sobrando, candidatas a devolução/duplicata).
//
// Uso:
//   cd coletor && npm install
//   TRIER_TOKEN="..." DATABASE_URL="..." node comparar_periodo.js
//
// Opcionais: DATA_INICIAL (default 2026-08-01T00:00:00-03:00),
// DATA_FINAL (default agora), COD_FILIAL (default 1).
'use strict';

const { Client } = require('pg');

const TRIER_TOKEN = process.env.TRIER_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;
const BASE_URL = process.env.TRIER_BASE_URL || 'https://api-sgf-gateway.triersistemas.com.br/sgfpod1/rest/integracao';
const DATA_INICIAL = new Date(process.env.DATA_INICIAL || '2026-08-01T00:00:00-03:00');
const DATA_FINAL = process.env.DATA_FINAL ? new Date(process.env.DATA_FINAL) : new Date();
const COD_FILIAL = process.env.COD_FILIAL ? Number(process.env.COD_FILIAL) : 1;

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

function valorLiquidoVenda(venda) {
  return (venda.itens || []).reduce((soma, item) => soma + (Number(item.valorTotalLiquido) || 0), 0);
}

async function main() {
  const dataInicialStr = formatarDataTrier(DATA_INICIAL);
  const dataFinalStr = formatarDataTrier(DATA_FINAL);
  console.log(`Período: ${dataInicialStr} até ${dataFinalStr} | filial ${COD_FILIAL}\n`);

  console.log('Buscando vendas na Trier...');
  const vendasTrier = await buscarTudo('/venda/obter-alterados-v1', {
    dataInicial: dataInicialStr,
    dataFinal: dataFinalStr,
  });

  console.log('Buscando cancelamentos na Trier (endpoint dedicado)...');
  let cancelamentosTrier = [];
  try {
    cancelamentosTrier = await buscarTudo('/venda/cancelamento/obter-alterados-v1', {
      dataInicial: dataInicialStr,
      dataFinal: dataFinalStr,
    });
  } catch (erro) {
    console.warn(`  (falhou, seguindo sem isso: ${erro.message})`);
  }

  const vendasFilial = vendasTrier.filter((v) => COD_FILIAL == null || v.codFilial === COD_FILIAL);
  const comTipoCancelamento = vendasTrier.filter((v) => v.tipoCancelamento != null);
  const comNumeroNotaOrigem = vendasTrier.filter((v) => v.numeroNotaOrigem != null);

  console.log('\n=== Resposta CRUA da API (antes de qualquer mapeamento do coletor) ===');
  console.log(`Total de vendas devolvidas por /venda/obter-alterados-v1: ${vendasTrier.length}`);
  console.log(`  ...com tipoCancelamento preenchido: ${comTipoCancelamento.length}`);
  console.log(`  ...com numeroNotaOrigem preenchido: ${comNumeroNotaOrigem.length}`);
  console.log(`Total devolvido por /venda/cancelamento/obter-alterados-v1: ${cancelamentosTrier.length}`);
  if (comTipoCancelamento.length > 0) {
    console.log('Exemplos com tipoCancelamento preenchido:', comTipoCancelamento.slice(0, 5).map((v) => ({
      numeroNota: v.numeroNota, numeroNotaOrigem: v.numeroNotaOrigem, tipoCancelamento: v.tipoCancelamento,
    })));
  }
  if (cancelamentosTrier.length > 0) {
    console.log('Exemplos do endpoint de cancelamento:', cancelamentosTrier.slice(0, 5).map((v) => ({
      numeroNota: v.numeroNota, numeroNotaOrigem: v.numeroNotaOrigem, tipoCancelamento: v.tipoCancelamento,
    })));
  }

  const trierPorNota = new Map();
  for (const v of vendasFilial) {
    trierPorNota.set(v.numeroNota, { valor: valorLiquidoVenda(v), codigoVendedor: v.codigoVendedor });
  }
  const valorTotalTrier = [...trierPorNota.values()].reduce((s, v) => s + v.valor, 0);

  console.log(`\n=== Trier, filial ${COD_FILIAL} ===`);
  console.log(`Vendas: ${trierPorNota.size} | Valor líquido: R$ ${valorTotalTrier.toFixed(2)}`);

  console.log('\nConectando no Supabase...');
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const { rows } = await client.query(
    `select v.numero_nota, v.codigo_vendedor, v.tipo_cancelamento, v.numero_nota_origem,
            coalesce(sum(vi.valor_total_liquido), 0) as valor_liquido
     from vendas v
     left join venda_itens vi on vi.venda_id = v.id
     where v.data_emissao between $1 and $2
       and v.cod_filial = $3
     group by v.numero_nota, v.codigo_vendedor, v.tipo_cancelamento, v.numero_nota_origem`,
    [DATA_INICIAL.toISOString().slice(0, 10), DATA_FINAL.toISOString().slice(0, 10), COD_FILIAL]
  );
  await client.end();

  const bancoPorNota = new Map();
  for (const r of rows) {
    bancoPorNota.set(r.numero_nota, { valor: Number(r.valor_liquido), codigoVendedor: r.codigo_vendedor });
  }
  const valorTotalBanco = [...bancoPorNota.values()].reduce((s, v) => s + v.valor, 0);

  console.log(`\n=== Nosso banco, filial ${COD_FILIAL} (mesmo período) ===`);
  console.log(`Vendas: ${bancoPorNota.size} | Valor líquido: R$ ${valorTotalBanco.toFixed(2)}`);

  const faltandoNoBanco = [...trierPorNota.keys()].filter((n) => !bancoPorNota.has(n));
  const sobrandoNoBanco = [...bancoPorNota.keys()].filter((n) => !trierPorNota.has(n));

  console.log(`\n=== Diferença ===`);
  console.log(`Notas na Trier que NÃO estão no banco (perdidas pelo coletor): ${faltandoNoBanco.length}`);
  if (faltandoNoBanco.length > 0) console.log('  ', faltandoNoBanco.slice(0, 30));
  console.log(`Notas no banco que NÃO vieram nessa chamada da Trier (sobrando): ${sobrandoNoBanco.length}`);
  if (sobrandoNoBanco.length > 0) console.log('  ', sobrandoNoBanco.slice(0, 30));
  console.log(`Diferença de valor (banco - trier): R$ ${(valorTotalBanco - valorTotalTrier).toFixed(2)}`);
}

main().catch((erro) => {
  console.error('\nErro:', erro.message);
  process.exit(1);
});
