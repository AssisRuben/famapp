// Backfill histórico ÚNICO (não recorrente — diferente do
// sgf-incremental.n8n.json, que roda a cada 15 min). Puxa TUDO que a
// API SGF tem pra oferecer no período configurado, com paginação de
// verdade (o coletor incremental não tem isso ainda — ver alerta em
// coletor/README.md, seção 4).
//
// Uso:
//   cd coletor && npm install && node backfill_periodo.js
//
// Variáveis de ambiente obrigatórias:
//   TRIER_TOKEN     — o mesmo Bearer token usado na credencial do n8n
//   DATABASE_URL    — connection string do Supabase (Session Pooler,
//                     porta 5432 — NÃO a Transaction Pooler nem a
//                     conexão direta; ver coletor/README.md pros
//                     detalhes de por quê)
//
// Opcionais:
//   DATA_INICIAL    — default '2026-01-01T00:00:00-03:00'
//   ENTIDADES       — lista separada por vírgula pra rodar só um
//                     subconjunto (ex.: "produto,fornecedor,compra"),
//                     útil pra retomar depois de uma falha parcial sem
//                     repetir tudo. Default: todas.
//
// O que NÃO faz: não mexe em sync_control (isso é do coletor
// incremental, que continua rodando por conta própria) e não é
// idempotente pra compras/compras_itens (rodar duas vezes duplica —
// ver comentário perto de sincronizarCompras).
'use strict';

const { Client } = require('pg');

const TRIER_TOKEN = process.env.TRIER_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;
const BASE_URL = process.env.TRIER_BASE_URL || 'https://api-sgf-gateway.triersistemas.com.br/sgfpod1/rest/integracao';
const DATA_INICIAL = new Date(process.env.DATA_INICIAL || '2026-01-01T00:00:00-03:00');
const DATA_FINAL = new Date();
const ENTIDADES = new Set(
  (process.env.ENTIDADES || 'vendedor,cliente,produto,fornecedor,compra,venda,atendimentos')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

if (!TRIER_TOKEN) {
  console.error('Faltou TRIER_TOKEN (o mesmo Bearer da credencial "SGF Trier - Bearer" no n8n).');
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error('Faltou DATABASE_URL (connection string do Session Pooler do Supabase — ver coletor/README.md).');
  process.exit(1);
}

// A API rejeita ISO com "Z"/milissegundos — espera "-0300" fixo, sem
// dois-pontos no offset (mesmo formato documentado em coletor/README.md
// pro workflow incremental). Construído a partir de UTC pra não
// depender do fuso horário de onde este script roda.
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

// Paginação de verdade: incrementa primeiroRegistro em passos de 999
// até a API devolver menos que isso — só aí sabe que chegou ao fim.
// É exatamente o que falta no coletor incremental (fixo em página 0).
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
    await dormir(150); // não martelar o gateway
  }
  process.stdout.write('\n');
  return linhas;
}

function pgVal(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object' && !(v instanceof Date)) return JSON.stringify(v);
  return v;
}

// Upsert em lote com placeholders parametrizados ($1, $2, ...) — mais
// seguro que a interpolação de string usada nos Code nodes do n8n
// (que precisa disso por limitação do Code node; aqui não precisa).
async function upsertLote(client, { tabela, colunas, linhas, conflito, atualizarColunas, tamanhoLote = 500 }) {
  let total = 0;
  for (let inicio = 0; inicio < linhas.length; inicio += tamanhoLote) {
    const lote = linhas.slice(inicio, inicio + tamanhoLote);
    const valores = [];
    const grupos = lote.map((linha, i) => {
      const base = i * colunas.length;
      valores.push(...linha.map(pgVal));
      return `(${colunas.map((_, j) => `$${base + j + 1}`).join(', ')})`;
    });
    const updateSet = atualizarColunas.map((c) => `${c} = EXCLUDED.${c}`).join(', ');
    await client.query(
      `INSERT INTO ${tabela} (${colunas.join(', ')})
       VALUES ${grupos.join(',\n')}
       ON CONFLICT (${conflito}) DO UPDATE SET ${updateSet}`,
      valores
    );
    total += lote.length;
  }
  return total;
}

async function sincronizarVendedores(client) {
  const linhas = await buscarTudo('/vendedor/obter-todos-v1');
  const colunas = ['codigo', 'nome', 'numero_cpf', 'cep', 'email', 'ativo'];
  const total = await upsertLote(client, {
    tabela: 'vendedores',
    colunas,
    linhas: linhas.map((v) => [v.codigo, v.nome, v.numeroCpf, v.cep, v.email, v.ativo]),
    conflito: 'codigo',
    atualizarColunas: colunas.slice(1),
  });
  console.log(`  vendedores: ${total} upsertados.`);
}

async function sincronizarClientes(client) {
  const linhas = await buscarTudo('/cliente/obter-todos-v1');
  const colunas = [
    'codigo', 'nome', 'numero_cpf_cnpj', 'codigo_cidade', 'email', 'cep', 'estado',
    'fone', 'bairro', 'logradouro', 'numero_endereco', 'ativo', 'grupo', 'empresa_convenio',
  ];
  const total = await upsertLote(client, {
    tabela: 'clientes',
    colunas,
    linhas: linhas.map((c) => [
      c.codigo, c.nome, c.numeroCpfCnpj, c.codigoCidade, c.email, c.cep, c.estado,
      c.fone, c.bairro, c.logradouro, c.numeroEndereco, c.ativo, c.grupo ?? null, c.empresaConvenio ?? null,
    ]),
    conflito: 'codigo',
    atualizarColunas: colunas.slice(1),
  });
  console.log(`  clientes: ${total} upsertados.`);
}

// ProdutoIntegracaoDto não tem campo "marca" — nomeLaboratorio é a
// aproximação mais próxima (fabricante), não é exatamente a mesma
// coisa. codigoBarras vem como int64 na API; nossa coluna é text.
async function sincronizarProdutos(client) {
  const linhas = await buscarTudo('/produto/obter-todos-v1');
  const colunas = ['codigo', 'codigo_barras', 'nome', 'categoria', 'marca', 'preco_venda', 'custo_medio', 'estoque_atual'];
  const total = await upsertLote(client, {
    tabela: 'produto_catalogo',
    colunas,
    linhas: linhas.map((p) => [
      p.codigo,
      p.codigoBarras != null ? String(p.codigoBarras) : null,
      p.nome,
      p.nomeCategoria ?? p.nomeGrupo ?? null,
      p.nomeLaboratorio ?? null,
      p.valorVenda ?? 0,
      p.valorCustoMedio ?? p.valorCusto ?? 0,
      p.quantidadeEstoque ?? 0,
    ]),
    conflito: 'codigo',
    atualizarColunas: colunas.slice(1),
  });
  console.log(`  produto_catalogo: ${total} upsertados.`);
}

async function sincronizarFornecedores(client) {
  const linhas = await buscarTudo('/fornecedor/obter-todos-v1');
  const colunas = ['codigo', 'nome_fantasia', 'razao_social', 'numero_cnpj', 'nome_cidade', 'email', 'ativo'];
  const total = await upsertLote(client, {
    tabela: 'fornecedores',
    colunas,
    linhas: linhas.map((f) => [f.codigo, f.nomeFantasia, f.razaoSocial, f.numeroCnpj, f.nomeCidade, f.email, f.ativo]),
    conflito: 'codigo',
    atualizarColunas: colunas.slice(1),
  });
  console.log(`  fornecedores: ${total} upsertados.`);
}

// compras/compras_itens não têm constraint única (tabelas ficaram
// vazias até agora — ver conversa) — INSERT direto, sem ON CONFLICT.
// NÃO idempotente: rodar isso duas vezes duplica as compras do
// período. Se precisar rodar de novo, TRUNCATE compras, compras_itens
// antes (compras_itens cai em cascata pela FK).
async function sincronizarCompras(client) {
  const linhas = await buscarTudo('/compra/obter-alterados-v1', {
    dataInicial: formatarDataTrier(DATA_INICIAL),
    dataFinal: formatarDataTrier(DATA_FINAL),
  });

  let totalCompras = 0;
  let totalItens = 0;
  for (const compra of linhas) {
    const { rows } = await client.query(
      `INSERT INTO compras (data_entrada, numero_nota_fiscal, codigo_fornecedor, valor_total_nota, valor_total_produtos, quantidade_itens, chave_acesso_nfe)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        compra.dataEntrada ?? null,
        compra.numeroNotaFiscal ?? null,
        compra.codigoFornecedor ?? null,
        compra.valorTotalNota ?? null,
        compra.valorTotalProdutos ?? null,
        compra.quantidadeItens ?? null,
        compra.chaveAcessoNfe ?? null,
      ]
    );
    const compraId = rows[0].id;
    totalCompras += 1;

    const itens = compra.itens || [];
    if (itens.length > 0) {
      await upsertLoteSemConflito(client, {
        tabela: 'compras_itens',
        colunas: ['compra_id', 'codigo_produto', 'quantidade_produtos', 'fator_compra', 'valor_unitario', 'valor_unitario_liquido', 'valor_custo', 'valor_st'],
        linhas: itens.map((it) => [
          compraId, it.codigoProduto, it.quantidadeProdutos, it.fatorCompra ?? 1, it.valorUnitario, it.valorUnitarioLiquido, it.valorCusto, it.valorST,
        ]),
      });
      totalItens += itens.length;
    }
  }
  console.log(`  compras: ${totalCompras} inseridas, ${totalItens} itens.`);
}

async function upsertLoteSemConflito(client, { tabela, colunas, linhas, tamanhoLote = 500 }) {
  for (let inicio = 0; inicio < linhas.length; inicio += tamanhoLote) {
    const lote = linhas.slice(inicio, inicio + tamanhoLote);
    const valores = [];
    const grupos = lote.map((linha, i) => {
      const base = i * colunas.length;
      valores.push(...linha.map(pgVal));
      return `(${colunas.map((_, j) => `$${base + j + 1}`).join(', ')})`;
    });
    await client.query(`INSERT INTO ${tabela} (${colunas.join(', ')}) VALUES ${grupos.join(',\n')}`, valores);
  }
}

// mesma lógica de "Mapear vendas" + "Preparar itens e cursor" do
// sgf-incremental.n8n.json (stub de FK, parsing de hora, mapeamento de
// venda_com_desconto/venda_ecommerce) — só trocando a interpolação de
// string por parâmetros e adicionando paginação de verdade.
function horaParaPg(bruto) {
  if (bruto === null || bruto === undefined || bruto === '') return null;
  const s = String(bruto);
  const idxT = s.indexOf('T');
  if (idxT >= 0 && s.length >= idxT + 9) return s.slice(idxT + 1, idxT + 9);
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(s)) return s.length === 5 ? s + ':00' : s;
  if (/^\d{1,2}$/.test(s)) return s.padStart(2, '0') + ':00:00';
  return null;
}

async function sincronizarVendas(client) {
  const vendas = await buscarTudo('/venda/obter-alterados-v1', {
    dataInicial: formatarDataTrier(DATA_INICIAL),
    dataFinal: formatarDataTrier(DATA_FINAL),
  });
  if (vendas.length === 0) {
    console.log('  vendas: nenhuma no período.');
    return;
  }

  const codigosClientes = [...new Set(vendas.map((v) => v.codigoCliente).filter((c) => c != null))];
  const codigosVendedores = new Set(vendas.map((v) => v.codigoVendedor).filter((c) => c != null));
  for (const venda of vendas) {
    for (const item of venda.itens || []) {
      if (item.codigoVendedor != null) codigosVendedores.add(item.codigoVendedor);
    }
  }

  if (codigosClientes.length > 0) {
    await upsertLoteSemConflitoIgnorando(client, 'clientes', ['codigo'], codigosClientes.map((c) => [c]));
  }
  if (codigosVendedores.size > 0) {
    await upsertLoteSemConflitoIgnorando(
      client,
      'vendedores',
      ['codigo', 'nome'],
      [...codigosVendedores].map((c) => [c, '(pendente sincronizacao)'])
    );
  }

  let totalVendas = 0;
  let totalItens = 0;
  for (const v of vendas) {
    const dataEmissao = v.dataEmissao ? String(v.dataEmissao).slice(0, 10) : null;
    const vendaEcommerce = v.vendaEcommerce === 'S';
    const { rows } = await client.query(
      `INSERT INTO vendas (numero_nota, numero_nota_origem, tipo_cancelamento, data_emissao, hora_emissao, codigo_vendedor, codigo_cliente, entrega, pagamento_na_entrega, condicao_pagamento, vlr_troco, numero_cupom_fiscal, numero_nota_fiscal, xml_nfe, cod_parceiro, cod_filial, venda_ifood, venda_ecommerce, cod_ecommerce, ser_nota_fiscal, modelo_venda, dados_entrega)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       ON CONFLICT (numero_nota, cod_filial, ser_nota_fiscal) DO UPDATE SET
         numero_nota_origem = EXCLUDED.numero_nota_origem, tipo_cancelamento = EXCLUDED.tipo_cancelamento,
         data_emissao = EXCLUDED.data_emissao, hora_emissao = EXCLUDED.hora_emissao,
         codigo_vendedor = EXCLUDED.codigo_vendedor, codigo_cliente = EXCLUDED.codigo_cliente,
         entrega = EXCLUDED.entrega, pagamento_na_entrega = EXCLUDED.pagamento_na_entrega,
         condicao_pagamento = EXCLUDED.condicao_pagamento, vlr_troco = EXCLUDED.vlr_troco,
         numero_cupom_fiscal = EXCLUDED.numero_cupom_fiscal, numero_nota_fiscal = EXCLUDED.numero_nota_fiscal,
         xml_nfe = EXCLUDED.xml_nfe, cod_parceiro = EXCLUDED.cod_parceiro,
         venda_ifood = EXCLUDED.venda_ifood, venda_ecommerce = EXCLUDED.venda_ecommerce,
         cod_ecommerce = EXCLUDED.cod_ecommerce, modelo_venda = EXCLUDED.modelo_venda,
         dados_entrega = EXCLUDED.dados_entrega, updated_at = now()
       RETURNING id`,
      [
        v.numeroNota, v.numeroNotaOrigem ?? null, v.tipoCancelamento ?? null, dataEmissao, horaParaPg(v.horaEmissao),
        v.codigoVendedor ?? null, v.codigoCliente ?? null, v.entrega ?? null, v.pagamentoNaEntrega ?? null,
        pgVal(v.condicaoPagamento ?? null), v.vlrTroco ?? null, v.numeroCupomFiscal ?? null, v.numeroNotaFiscal ?? null,
        v.xmlNfe ?? null, v.codParceiro ?? null, v.codFilial ?? null, v.vendaIfood ?? null, vendaEcommerce,
        v.codEcommerce ?? null, v.serNotaFiscal ?? null, v.modeloVenda ?? null, pgVal(v.dadosEntrega ?? null),
      ]
    );
    const vendaId = rows[0].id;
    totalVendas += 1;

    const itens = v.itens || [];
    if (itens.length === 0) continue;

    const linhasItens = itens.map((item) => {
      const vendaComDescontoBool = item.vendaComDesconto != null && item.vendaComDesconto !== item.valorTotalLiquido;
      return [
        vendaId, item.codigoProduto, item.codigoVendedor ?? null, item.quantidadeProdutos, item.valorTotalBruto,
        item.valorTotalLiquido, item.valorTotalCusto, item.parceiro ?? null, item.codigoMedico ?? null, item.codBarras ?? null,
        item.numSequencial ?? null, item.prcComissao ?? null, item.vlrDesconto ?? null, item.vlrUnitario ?? null,
        item.vlrCustoAquisicao ?? null, item.vlrCustoProduto ?? null, item.tabelaDesconto ?? null, item.prcDesconto ?? null,
        item.prcDescontoMax ?? null, vendaComDescontoBool,
      ];
    });

    await upsertLote(client, {
      tabela: 'venda_itens',
      colunas: [
        'venda_id', 'codigo_produto', 'codigo_vendedor', 'quantidade_produtos', 'valor_total_bruto', 'valor_total_liquido',
        'valor_total_custo', 'parceiro', 'codigo_medico', 'cod_barras', 'num_sequencial', 'prc_comissao', 'vlr_desconto',
        'vlr_unitario', 'vlr_custo_aquisicao', 'vlr_custo_produto', 'tabela_desconto', 'prc_desconto', 'prc_desconto_max',
        'venda_com_desconto',
      ],
      linhas: linhasItens,
      conflito: 'venda_id, num_sequencial',
      atualizarColunas: [
        'codigo_produto', 'codigo_vendedor', 'quantidade_produtos', 'valor_total_bruto', 'valor_total_liquido',
        'valor_total_custo', 'parceiro', 'codigo_medico', 'cod_barras', 'prc_comissao', 'vlr_desconto', 'vlr_unitario',
        'vlr_custo_aquisicao', 'vlr_custo_produto', 'tabela_desconto', 'prc_desconto', 'prc_desconto_max', 'venda_com_desconto',
      ],
    });
    totalItens += itens.length;
  }
  console.log(`  vendas: ${totalVendas} upsertadas, ${totalItens} itens.`);
}

async function upsertLoteSemConflitoIgnorando(client, tabela, colunas, linhas) {
  if (linhas.length === 0) return;
  const valores = [];
  const grupos = linhas.map((linha, i) => {
    const base = i * colunas.length;
    valores.push(...linha.map(pgVal));
    return `(${colunas.map((_, j) => `$${base + j + 1}`).join(', ')})`;
  });
  await client.query(
    `INSERT INTO ${tabela} (${colunas.join(', ')}) VALUES ${grupos.join(',\n')} ON CONFLICT (codigo) DO NOTHING`,
    valores
  );
}

async function sincronizarAtendimentos(client) {
  const linhas = await buscarTudo('/venda/obter-atendimentos-diario-vendedor-v1', {
    dataInicial: formatarDataTrier(DATA_INICIAL),
    dataFinal: formatarDataTrier(DATA_FINAL),
  });
  const colunas = ['data_emissao', 'codigo_vendedor', 'quantidade_itens', 'quantidade_atendimentos'];
  const total = await upsertLote(client, {
    tabela: 'vendas_vendedor_diario',
    colunas,
    linhas: linhas.map((a) => [String(a.dataEmissao).slice(0, 10), a.codigoVendedor, a.quantidadeItens, a.quantidadeAtendimentos]),
    conflito: 'data_emissao, codigo_vendedor',
    atualizarColunas: ['quantidade_itens', 'quantidade_atendimentos'],
  });
  console.log(`  atendimentos: ${total} upsertados.`);
}

async function main() {
  console.log(`Período: ${formatarDataTrier(DATA_INICIAL)} até ${formatarDataTrier(DATA_FINAL)}`);
  console.log(`Entidades: ${[...ENTIDADES].join(', ')}\n`);

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    // ordem importa: produto antes de compra (FK), fornecedor antes de
    // compra (FK), vendedor/cliente antes de venda (FK, embora venda já
    // tenha o próprio stub de segurança).
    if (ENTIDADES.has('vendedor')) { console.log('Vendedores...'); await sincronizarVendedores(client); }
    if (ENTIDADES.has('cliente')) { console.log('Clientes...'); await sincronizarClientes(client); }
    if (ENTIDADES.has('produto')) { console.log('Catálogo de produtos...'); await sincronizarProdutos(client); }
    if (ENTIDADES.has('fornecedor')) { console.log('Fornecedores...'); await sincronizarFornecedores(client); }
    if (ENTIDADES.has('compra')) { console.log('Compras...'); await sincronizarCompras(client); }
    if (ENTIDADES.has('venda')) { console.log('Vendas...'); await sincronizarVendas(client); }
    if (ENTIDADES.has('atendimentos')) { console.log('Atendimentos diários...'); await sincronizarAtendimentos(client); }
    console.log('\nConcluído.');
  } finally {
    await client.end();
  }
}

main().catch((erro) => {
  console.error('\nFalhou:', erro.message);
  process.exit(1);
});
