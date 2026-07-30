// Roda os Code nodes de sgf-incremental.n8n.json fora do n8n, com dados
// falsos no formato real dos DTOs da API SGF, e imprime o SQL gerado —
// pra conferir visualmente (aspas escapadas, jsonb, contagem de colunas,
// FK venda->itens) sempre que o workflow for editado. Não substitui um
// teste de importação real no n8n, só pega erro óbvio antes disso.
// Uso: node coletor/testar_workflow.js
const fs = require('fs');
const wf = JSON.parse(fs.readFileSync(__dirname + '/sgf-incremental.n8n.json', 'utf8'));

function noByName(name) {
  return wf.nodes.find((n) => n.name === name);
}

// Mock de contexto n8n mínimo o suficiente pra rodar os Code nodes.
// Os Code nodes não fazem mais chamada HTTP (isso agora é nó HTTP
// Request nativo, fora do escopo deste teste) — só processam $input.
function mockContext({ inputItems, pairedNodes }) {
  const $input = {
    first: () => inputItems[0],
    all: () => inputItems,
  };
  const $ = (nodeName) => ({
    item: { json: pairedNodes[nodeName] },
    first: () => ({ json: pairedNodes[nodeName] }),
  });
  return { $input, $ };
}

async function runCodeNode(nodeName, ctx) {
  const node = noByName(nodeName);
  const fn = new Function('$input', '$', 'return (async () => {\n' + node.parameters.jsCode + '\n})()');
  return fn(ctx.$input, ctx.$);
}

(async () => {
  console.log('========== VENDEDOR ==========');
  let ctx = mockContext({
    inputItems: [
      { json: { codigo: 101, nome: "MARIA D'AVILA", numeroCpf: '12345678901', cep: null, email: null, ativo: true } },
      { json: { codigo: 102, nome: 'JOÃO SILVA', numeroCpf: null, cep: '95900-000', email: 'joao@teste.com', ativo: false } },
    ],
    pairedNodes: {},
  });
  let r = await runCodeNode('Mapear vendedores', ctx);
  console.log(r[0].json.sql);
  console.log('---');

  console.log('========== VENDEDOR (resposta como array num item so) ==========');
  ctx = mockContext({
    inputItems: [
      { json: [
        { codigo: 201, nome: 'TESTE ARRAY', numeroCpf: null, cep: null, email: null, ativo: true },
      ] },
    ],
    pairedNodes: {},
  });
  r = await runCodeNode('Mapear vendedores', ctx);
  console.log(r[0].json.sql);
  console.log('quantidade:', r[0].json.quantidade, '(esperado: 1)');
  console.log('---');

  console.log('========== CLIENTE ==========');
  ctx = mockContext({
    inputItems: [
      {
        json: {
          codigo: 5001, nome: "CLIENTE TESTE O'BRIEN", numeroCpfCnpj: '145.440.400-00', codigoCidade: 'LAJEADO',
          email: null, cep: '95900000', estado: 'RS', fone: '(48)99999-9999', bairro: 'CENTRO',
          logradouro: 'RUA PARAIBA', numeroEndereco: '759', ativo: true,
          grupo: { codigo: 1, descricao: 'Grupo "Especial"' }, empresaConvenio: null,
        },
      },
    ],
    pairedNodes: {},
  });
  r = await runCodeNode('Mapear clientes', ctx);
  console.log(r[0].json.sql);
  console.log('---');

  console.log('========== ATENDIMENTOS (vazio) ==========');
  ctx = mockContext({ inputItems: [], pairedNodes: {} });
  r = await runCodeNode('Mapear atendimentos', ctx);
  console.log(r[0].json.sql);
  console.log('---');

  console.log('========== VENDA (buscar/mapear) ==========');
  ctx = mockContext({
    inputItems: [
      {
        json: {
          numeroNota: 123456, numeroNotaOrigem: null, tipoCancelamento: null,
          dataEmissao: '2026-07-29T00:00:00-03:00', horaEmissao: '2026-07-29T14:32:10-03:00',
          codigoVendedor: 101, codigoCliente: 5001, entrega: false, pagamentoNaEntrega: false,
          condicaoPagamento: { codigo: 1, descricao: 'A VISTA' }, vlrTroco: 0,
          numeroCupomFiscal: 9999, numeroNotaFiscal: 7654321, xmlNfe: null,
          codParceiro: null, codFilial: 1, vendaIfood: false, vendaEcommerce: null,
          codEcommerce: null, serNotaFiscal: '1', modeloVenda: '55', dadosEntrega: null,
          itens: [
            {
              codigoProduto: 12345, codigoVendedor: 101, quantidadeProdutos: 2,
              valorTotalBruto: 199.9, valorTotalLiquido: 189.9, valorTotalCusto: 150.0,
              parceiro: false, codigoMedico: null, codBarras: 7894900011517, numSequencial: 1,
              prcComissao: 5.0, vlrDesconto: 10.0, vlrUnitario: 99.95, vlrCustoAquisicao: 75.1234,
              vlrCustoProduto: 75.12, tabelaDesconto: null, prcDesconto: 10.0, prcDescontoMax: 15.0,
              vendaComDesconto: 189.9,
            },
            {
              codigoProduto: 24766, codigoVendedor: 101, quantidadeProdutos: 1,
              valorTotalBruto: 8.0, valorTotalLiquido: 8.0, valorTotalCusto: 0,
              parceiro: false, codigoMedico: null, codBarras: null, numSequencial: 2,
              prcComissao: 0, vlrDesconto: 0, vlrUnitario: 8.0, vlrCustoAquisicao: 0,
              vlrCustoProduto: 0, tabelaDesconto: null, prcDesconto: 0, prcDescontoMax: 0,
              vendaComDesconto: null,
            },
          ],
        },
      },
      {
        json: {
          numeroNota: 999, numeroNotaOrigem: null, tipoCancelamento: null,
          dataEmissao: '2016-04-20', horaEmissao: '00',
          codigoVendedor: 3, codigoCliente: null, entrega: false, pagamentoNaEntrega: false,
          condicaoPagamento: { codigo: 1, descricao: 'DINHEIRO' }, vlrTroco: 0,
          numeroCupomFiscal: null, numeroNotaFiscal: null, xmlNfe: null,
          codParceiro: null, codFilial: 1, vendaIfood: false, vendaEcommerce: null,
          codEcommerce: null, serNotaFiscal: '1', modeloVenda: '55', dadosEntrega: null,
          itens: [],
        },
      },
    ],
    pairedNodes: {},
  });
  r = await runCodeNode('Mapear vendas', ctx);
  console.log(r[0].json.sql);
  console.log('--- vendasComItens ok?', Array.isArray(r[0].json.vendasComItens), r[0].json.vendasComItens.length);
  const mapearVendasOutput = r[0].json;
  console.log('---');

  console.log('========== VENDA (preparar itens, com RETURNING simulado) ==========');
  ctx = mockContext({
    inputItems: [{ json: { id: 999888, numero_nota: 123456, cod_filial: 1, ser_nota_fiscal: '1' } }],
    pairedNodes: { 'Mapear vendas': mapearVendasOutput },
  });
  r = await runCodeNode('Preparar itens e cursor', ctx);
  console.log(r[0].json.sql);
  console.log('quantidadeItens:', r[0].json.quantidadeItens);

  console.log('\n========== VENDA (preparar itens, SEM retorno -- caso 0 vendas) ==========');
  ctx = mockContext({
    inputItems: [],
    pairedNodes: { 'Mapear vendas': { vendasComItens: [], cursorNovo: '2026-07-30T12:00:00.000Z' } },
  });
  r = await runCodeNode('Preparar itens e cursor', ctx);
  console.log(r[0].json.sql);

  console.log('\nTUDO RODOU SEM EXCEÇÃO.');
})().catch((e) => {
  console.error('FALHOU:', e);
  process.exit(1);
});
