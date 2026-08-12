// Script de investigação, SÓ LEITURA — não grava nada. Busca
// /integracao/estoque/obter-alterados-v1 (ainda não sincronizado pelo
// coletor) e imprime valorCustoMedio/valorUltimaEntrada só dos produtos
// pedidos, pra comparar com o custo de aquisição real conhecido pelo
// usuário (achado 12/08/2026: API não tem campo "custo de aquisição"
// em lugar nenhum, mas tem "valor última entrada" nesse endpoint —
// ver coletor/README.md).
//
// Uso:
//   cd coletor && npm install
//   TRIER_TOKEN="..." CODIGOS_PRODUTO="3434,1687,6126,24877" node inspecionar_estoque.js
//
// Sem CODIGOS_PRODUTO, mostra os 20 primeiros que vierem (não filtra).
'use strict';

const TRIER_TOKEN = process.env.TRIER_TOKEN;
const BASE_URL = process.env.TRIER_BASE_URL || 'https://api-sgf-gateway.triersistemas.com.br/sgfpod1/rest/integracao';
const DATA_INICIAL = process.env.DATA_INICIAL || '2000-01-01T00:00:00-0300';
const DATA_FINAL = process.env.DATA_FINAL || new Date().toISOString();
const CODIGOS_PRODUTO = process.env.CODIGOS_PRODUTO
  ? new Set(process.env.CODIGOS_PRODUTO.split(',').map((s) => Number(s.trim())))
  : null;

if (!TRIER_TOKEN) {
  console.error('Faltou TRIER_TOKEN (o mesmo Bearer da credencial "SGF Trier - Bearer" no n8n).');
  process.exit(1);
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
  console.log('Buscando estoque na Trier (pode demorar um pouco no catálogo inteiro)...');
  const estoque = await buscarTudo('/estoque/obter-alterados-v1', {
    dataInicial: DATA_INICIAL,
    dataFinal: DATA_FINAL,
  });
  console.log(`Total: ${estoque.length} registro(s) de estoque.\n`);

  const filtrado = CODIGOS_PRODUTO ? estoque.filter((e) => CODIGOS_PRODUTO.has(e.codigoProduto)) : estoque.slice(0, 20);

  console.table(
    filtrado.map((e) => ({
      codigoProduto: e.codigoProduto,
      quantidadeEstoque: e.quantidadeEstoque,
      valorCustoMedio: e.valorCustoMedio,
      valorUltimaEntrada: e.valorUltimaEntrada,
      dataUltimaEntrada: e.dataUltimaEntrada,
    }))
  );

  if (CODIGOS_PRODUTO) {
    const achados = new Set(filtrado.map((e) => e.codigoProduto));
    const faltando = [...CODIGOS_PRODUTO].filter((c) => !achados.has(c));
    if (faltando.length > 0) {
      console.log(`\nCódigo(s) pedido(s) sem registro de estoque retornado: ${faltando.join(', ')}`);
    }
  }
}

main().catch((erro) => {
  console.error('\nErro:', erro.message);
  process.exit(1);
});
