// Script de investigação, SÓ LEITURA — não grava nada. Busca
// /produto/obter-todos-v1 e imprime valorCusto/valorCustoMedio SEPARADOS
// (sem o ?? que o coletor usa hoje) só dos produtos pedidos, pra
// descobrir qual campo da API corresponde a qual valor da tela da Trier
// (achado 12/08/2026, conferindo Glifage XR código 3434 na tela de
// Cadastros > Produtos: Valor Última Entrada sem ST = 6,36 | Última
// Entrada + ST = 6,95 | Preço Custo/Custo Gerencial = 7,20 — o
// valorCustoMedio que já sincronizamos bate com "Última Entrada + ST",
// não com o Custo Gerencial que a Trier usa pra margem).
//
// Uso:
//   cd coletor && npm install
//   TRIER_TOKEN="..." CODIGOS_PRODUTO="3434,1687" node inspecionar_produto.js
'use strict';

const TRIER_TOKEN = process.env.TRIER_TOKEN;
const BASE_URL = process.env.TRIER_BASE_URL || 'https://api-sgf-gateway.triersistemas.com.br/sgfpod1/rest/integracao';
const CODIGOS_PRODUTO = process.env.CODIGOS_PRODUTO
  ? new Set(process.env.CODIGOS_PRODUTO.split(',').map((s) => Number(s.trim())))
  : null;

if (!TRIER_TOKEN) {
  console.error('Faltou TRIER_TOKEN (o mesmo Bearer da credencial "SGF Trier - Bearer" no n8n).');
  process.exit(1);
}
if (!CODIGOS_PRODUTO) {
  console.error('Faltou CODIGOS_PRODUTO (ex.: "3434,1687").');
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
  console.log('Buscando catálogo de produtos na Trier (26mil+ produtos, pode demorar)...');
  const produtos = await buscarTudo('/produto/obter-todos-v1');
  console.log(`Total: ${produtos.length} produto(s).\n`);

  const filtrados = produtos.filter((p) => CODIGOS_PRODUTO.has(p.codigo));

  console.table(
    filtrados.map((p) => ({
      codigo: p.codigo,
      nome: p.nome,
      valorCusto: p.valorCusto,
      valorCustoMedio: p.valorCustoMedio,
      valorVenda: p.valorVenda,
    }))
  );

  const achados = new Set(filtrados.map((p) => p.codigo));
  const faltando = [...CODIGOS_PRODUTO].filter((c) => !achados.has(c));
  if (faltando.length > 0) {
    console.log(`\nCódigo(s) pedido(s) não encontrado(s) no catálogo: ${faltando.join(', ')}`);
  }
}

main().catch((erro) => {
  console.error('\nErro:', erro.message);
  process.exit(1);
});
