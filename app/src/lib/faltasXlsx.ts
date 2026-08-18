import * as XLSX from 'xlsx';
import { ItemRelatorioFalta } from '../types/domain';
import { formatDateBR } from './format';

const CABECALHO = [
  'Produto',
  'Código',
  'Código de barras',
  'Fornecedor sugerido',
  'Custo médio (referência)',
  'Data do registro',
  'Registrado por',
];

function linha(item: ItemRelatorioFalta): (string | number)[] {
  return [
    item.nomeProduto,
    item.codigoProduto ?? '',
    item.codigoBarras ?? '',
    item.fornecedorSugerido ?? '',
    item.custoMedio ?? '',
    formatDateBR(item.data),
    item.nomeRegistradoPor ?? '',
  ];
}

const CARACTERES_INVALIDOS_ABA = /[\\/?*[\]:]/g;

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

// "Tem saldo no estoque? = Sim" não é falta de verdade pra comprar —
// é ruptura de gôndola (o sistema mostra saldo, só não achou o
// produto no balcão). Vai pra aba separada, de propósito FORA das
// abas por fornecedor, pra não virar pedido de compra de produto que
// já tem em estoque.
export function gerarXlsxRelatorioFaltas(itens: ItemRelatorioFalta[]): string {
  const wb = XLSX.utils.book_new();

  const paraComprar = itens.filter((i) => !i.temSaldoEstoque);
  const rupturaGondola = itens.filter((i) => i.temSaldoEstoque);

  const wsTodos = XLSX.utils.aoa_to_sheet([CABECALHO, ...paraComprar.map(linha)]);
  XLSX.utils.book_append_sheet(wb, wsTodos, 'Todos');

  const porFornecedor = new Map<string, ItemRelatorioFalta[]>();
  const semFornecedor: ItemRelatorioFalta[] = [];
  for (const item of paraComprar) {
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
    const ws = XLSX.utils.aoa_to_sheet([CABECALHO, ...itensFornecedor.map(linha)]);
    XLSX.utils.book_append_sheet(wb, ws, nomeAbaUnico(fornecedor, nomesUsados));
  }

  if (semFornecedor.length > 0) {
    const ws = XLSX.utils.aoa_to_sheet([CABECALHO, ...semFornecedor.map(linha)]);
    XLSX.utils.book_append_sheet(wb, ws, nomeAbaUnico('Sem fornecedor', nomesUsados));
  }

  if (rupturaGondola.length > 0) {
    const ws = XLSX.utils.aoa_to_sheet([CABECALHO, ...rupturaGondola.map(linha)]);
    XLSX.utils.book_append_sheet(wb, ws, nomeAbaUnico('Ruptura de gôndola (não comprar)', nomesUsados));
  }

  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
}
