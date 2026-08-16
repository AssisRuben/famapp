import * as XLSX from 'xlsx';
import { SugestaoCompra } from '../types/domain';

const CABECALHO_COMPLETO = [
  'Código',
  'Código de barras',
  'Produto',
  'Grupo',
  'Estoque atual',
  'Estoque alvo (a repor até)',
  'Fator de compra (unid. por caixa)',
  'Custo médio',
  'Preço de venda',
  'Margem (%)',
  'Fornecedor sugerido (compra mais recente)',
  'Fornecedor mais barato (12 meses)',
  'Preço mais barato (12 meses)',
  'Quantidade a comprar',
];

function linhaCompleta(item: SugestaoCompra): (string | number)[] {
  return [
    item.codigoProduto,
    item.codigoBarras,
    item.nomeProduto,
    item.grupo,
    item.estoqueAtual,
    item.estoqueAlvo,
    item.fatorCompra,
    item.custoMedio,
    item.precoVenda,
    item.margemAtualPct,
    item.fornecedorSugerido ?? '',
    item.fornecedorMaisBarato ?? '',
    item.precoMaisBarato ?? '',
    item.quantidadeSugerida,
  ];
}

// Só o necessário pra cotação/pedido — sem margem/preço de venda, que
// é informação interna e não faz sentido mandar pra quem está
// vendendo pra você.
const CABECALHO_FORNECEDOR = [
  'Código',
  'Código de barras',
  'Produto',
  'Fator de compra (unid. por caixa)',
  'Custo médio (referência)',
  'Quantidade a comprar',
];

function linhaFornecedor(item: SugestaoCompra): (string | number)[] {
  return [item.codigoProduto, item.codigoBarras, item.nomeProduto, item.fatorCompra, item.custoMedio, item.quantidadeSugerida];
}

const CARACTERES_INVALIDOS_ABA = /[\\/?*[\]:]/g;

// Nome de aba do Excel tem limite de 31 caracteres e não aceita alguns
// caracteres — sanitiza e garante que não colida com uma aba já usada
// (ex.: dois fornecedores com nome parecido depois de cortado).
function nomeAbaUnico(nomeBruto: string, usados: Set<string>): string {
  const base = (nomeBruto.replace(CARACTERES_INVALIDOS_ABA, ' ').trim() || 'Fornecedor').slice(0, 31);
  let candidato = base;
  let contador = 2;
  while (usados.has(candidato.toLowerCase())) {
    const sufixo = ` (${contador})`;
    candidato = base.slice(0, 31 - sufixo.length) + sufixo;
    contador++;
  }
  usados.add(candidato.toLowerCase());
  return candidato;
}

// Workbook com aba "Todos" (visão completa, uso interno) + uma aba por
// fornecedor sugerido (só o essencial pra cotação — pra mandar direto
// pro fornecedor sem precisar filtrar nada na mão). Agrupa pelo mesmo
// fornecedor que já aparece como badge principal na tela (compra mais
// recente), não o "mais barato" — evita introduzir uma escolha que o
// operador não faz hoje.
export function gerarXlsxSugestaoCompras(itens: SugestaoCompra[]): string {
  const wb = XLSX.utils.book_new();

  const wsTodos = XLSX.utils.aoa_to_sheet([CABECALHO_COMPLETO, ...itens.map(linhaCompleta)]);
  XLSX.utils.book_append_sheet(wb, wsTodos, 'Todos');

  const porFornecedor = new Map<string, SugestaoCompra[]>();
  const semFornecedor: SugestaoCompra[] = [];
  for (const item of itens) {
    if (!item.fornecedorSugerido) {
      semFornecedor.push(item);
      continue;
    }
    const lista = porFornecedor.get(item.fornecedorSugerido) ?? [];
    lista.push(item);
    porFornecedor.set(item.fornecedorSugerido, lista);
  }

  const nomesUsados = new Set<string>(['todos']);
  for (const [fornecedor, itensFornecedor] of porFornecedor) {
    const ws = XLSX.utils.aoa_to_sheet([CABECALHO_FORNECEDOR, ...itensFornecedor.map(linhaFornecedor)]);
    XLSX.utils.book_append_sheet(wb, ws, nomeAbaUnico(fornecedor, nomesUsados));
  }

  if (semFornecedor.length > 0) {
    const ws = XLSX.utils.aoa_to_sheet([CABECALHO_FORNECEDOR, ...semFornecedor.map(linhaFornecedor)]);
    XLSX.utils.book_append_sheet(wb, ws, nomeAbaUnico('Sem fornecedor', nomesUsados));
  }

  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
}
