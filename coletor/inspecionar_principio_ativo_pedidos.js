// Script de investigação, SÓ LEITURA — não grava nada. Responde duas
// perguntas com dado real da farmácia (28/09/2026), pra decidir como
// tratar "produto em falta que já foi reposto por outra marca":
//
//   1) Quanto do catálogo tem princípio ativo preenchido na Trier
//      (ProdutoIntegracaoDto.nomePrincipioAtivo) e quantos produtos
//      compartilham cada princípio — ou seja, se dá pra agrupar por
//      "mesma substância".
//   2) Se /pedido/itens/resumido existe e traz o pedido de compra do
//      Dose Certa (comprador, fornecedor, produto, quantidade,
//      transmitido) — sinal de "já comprei" ANTES da nota chegar.
//
// Uso:
//   cd coletor && npm install
//   TRIER_TOKEN="..." node inspecionar_principio_ativo_pedidos.js
//
// Opcional: DIAS_PEDIDOS=45 (janela dos pedidos, padrão 30) e
// CODIGOS_PRODUTO="7437,10004" pra ver o grupo de equivalentes de
// produtos específicos.
'use strict';

const TRIER_TOKEN = process.env.TRIER_TOKEN;
const BASE_URL = process.env.TRIER_BASE_URL || 'https://api-sgf-gateway.triersistemas.com.br/sgfpod1/rest/integracao';
const DIAS_PEDIDOS = Number(process.env.DIAS_PEDIDOS || 30);
const CODIGOS_PRODUTO = process.env.CODIGOS_PRODUTO
  ? new Set(process.env.CODIGOS_PRODUTO.split(',').map((s) => Number(s.trim())))
  : null;

if (!TRIER_TOKEN) {
  console.error('Faltou TRIER_TOKEN (o mesmo Bearer da credencial "SGF Trier - Bearer" no n8n).');
  process.exit(1);
}

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Formato de data que a Trier aceita (sem Z/ms, offset sem dois-pontos)
// — ver "Formato de data exigido pela Trier" em coletor/README.md.
function dataTrier(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}-0300`;
}

async function buscarTudo(caminho, paramsExtras = {}) {
  const QUANTIDADE = 999;
  let primeiroRegistro = 0;
  const linhas = [];
  for (;;) {
    const url = new URL(`${BASE_URL}${caminho}`);
    url.searchParams.set('primeiroRegistro', String(primeiroRegistro));
    url.searchParams.set('quantidadeRegistros', String(QUANTIDADE));
    for (const [chave, valor] of Object.entries(paramsExtras)) url.searchParams.set(chave, valor);

    const resposta = await fetch(url, { headers: { Authorization: `Bearer ${TRIER_TOKEN}` } });
    if (!resposta.ok) throw new Error(`${caminho} -> HTTP ${resposta.status}: ${await resposta.text()}`);
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

const pct = (parte, total) => (total ? `${((parte / total) * 100).toFixed(1)}%` : '—');

async function principioAtivo() {
  console.log('\n=== 1) PRINCÍPIO ATIVO NO CATÁLOGO ===');
  const produtos = await buscarTudo('/produto/obter-todos-v1');
  const ativos = produtos.filter((p) => p.ativo !== false);
  const comPA = ativos.filter((p) => p.nomePrincipioAtivo && String(p.nomePrincipioAtivo).trim());
  console.log(`Produtos ativos: ${ativos.length} | com princípio ativo: ${comPA.length} (${pct(comPA.length, ativos.length)})`);

  // Por grupo: onde o campo vem preenchido de verdade? (medicamento
  // deve ter quase 100%; perfumaria/conveniência tende a 0%.)
  const porGrupo = new Map();
  for (const p of ativos) {
    const g = String(p.nomeGrupo || '(sem grupo)').trim();
    const acc = porGrupo.get(g) || { total: 0, comPA: 0 };
    acc.total += 1;
    if (p.nomePrincipioAtivo && String(p.nomePrincipioAtivo).trim()) acc.comPA += 1;
    porGrupo.set(g, acc);
  }
  console.log('\nPreenchimento por grupo (só os 15 maiores):');
  console.table(
    [...porGrupo.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 15)
      .map(([grupo, v]) => ({ grupo, produtos: v.total, comPrincipioAtivo: v.comPA, preenchido: pct(v.comPA, v.total) }))
  );

  // Quantos produtos dividem o mesmo princípio ativo — é isso que
  // permite achar "o equivalente que já tem estoque".
  const porPA = new Map();
  for (const p of comPA) {
    const chave = String(p.nomePrincipioAtivo).trim().toUpperCase();
    porPA.set(chave, (porPA.get(chave) || []).concat(p));
  }
  const tamanhos = [...porPA.values()].map((l) => l.length);
  console.log(`\nPrincípios ativos distintos: ${porPA.size}`);
  console.log(`  com só 1 produto (sem equivalente): ${tamanhos.filter((n) => n === 1).length}`);
  console.log(`  com 2 a 5 produtos: ${tamanhos.filter((n) => n >= 2 && n <= 5).length}`);
  console.log(`  com 6+ produtos: ${tamanhos.filter((n) => n >= 6).length}`);

  console.log('\nOs 10 princípios com mais apresentações (exemplo de nomes):');
  console.table(
    [...porPA.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 10)
      .map(([nome, lista]) => ({
        principioAtivo: nome,
        produtos: lista.length,
        exemplos: lista.slice(0, 3).map((p) => p.nome).join(' | '),
      }))
  );

  if (CODIGOS_PRODUTO) {
    console.log('\nEquivalentes (mesmo princípio ativo) dos códigos pedidos:');
    for (const cod of CODIGOS_PRODUTO) {
      const base = produtos.find((p) => p.codigo === cod);
      if (!base) {
        console.log(`  ${cod}: não encontrado`);
        continue;
      }
      const chave = String(base.nomePrincipioAtivo || '').trim().toUpperCase();
      console.log(`\n  ${cod} ${base.nome} — princípio ativo: ${chave || '(vazio)'}`);
      if (chave) {
        console.table(
          (porPA.get(chave) || []).map((p) => ({
            codigo: p.codigo,
            nome: p.nome,
            laboratorio: p.nomeLaboratorio,
            tipo: p.nomeClassificacao,
            estoque: p.quantidadeEstoque,
          }))
        );
      }
    }
  }
}

async function pedidos() {
  console.log(`\n=== 2) PEDIDOS DE COMPRA (últimos ${DIAS_PEDIDOS} dias) ===`);
  const fim = new Date();
  const inicio = new Date(fim.getTime() - DIAS_PEDIDOS * 24 * 3600 * 1000);
  const itens = await buscarTudo('/pedido/itens/resumido/obter-alterados-v1', {
    dataInicial: dataTrier(inicio),
    dataFinal: dataTrier(fim),
  });
  console.log(`Itens de pedido no período: ${itens.length}`);
  if (itens.length === 0) {
    console.log('Nenhum item — ou o Dose Certa não gera "pedido" visível pela API, ou nada foi pedido nesse período.');
    return;
  }

  const numeros = new Set(itens.map((i) => i.numeroPedido));
  const transmitidos = new Set(itens.filter((i) => i.transmitido).map((i) => i.numeroPedido));
  console.log(`Pedidos distintos: ${numeros.size} | transmitidos ao fornecedor: ${transmitidos.size}`);

  console.log('\nCompradores:');
  const porComprador = new Map();
  for (const i of itens) porComprador.set(i.nomeComprador, (porComprador.get(i.nomeComprador) || 0) + 1);
  console.table([...porComprador.entries()].map(([comprador, qtdItens]) => ({ comprador, qtdItens })));

  console.log('\nAmostra de 10 itens (confere se bate com o que o comprador lembra de ter pedido):');
  console.table(
    itens.slice(0, 10).map((i) => ({
      pedido: i.numeroPedido,
      data: String(i.dataEmissao).slice(0, 10),
      fornecedor: i.nomeFornecedor,
      produto: i.nomeProduto,
      qtd: i.quantidadeProdutos,
      fator: i.fatorCompra,
      transmitido: i.transmitido,
      estoqueNaEpoca: i.quantidadeEstoque,
    }))
  );
}

async function main() {
  await principioAtivo();
  await pedidos();
}

main().catch((erro) => {
  console.error('\nErro:', erro.message);
  process.exit(1);
});
