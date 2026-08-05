import { SugestaoCompra } from '../types/domain';
import { montarCsv } from './csv';

// Colunas iguais ao que existe de fato: sem prazo de entrega/última
// cotação porque a API não expõe esses campos (ver lib/doseCerta.ts).
export function gerarCsvSugestaoCompras(itens: SugestaoCompra[]): string {
  const cabecalho = [
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

  const linhas = itens.map((item) => [
    String(item.codigoProduto),
    item.codigoBarras,
    item.nomeProduto,
    item.grupo,
    String(item.estoqueAtual),
    String(item.estoqueAlvo),
    String(item.fatorCompra),
    item.custoMedio.toFixed(2).replace('.', ','),
    item.precoVenda.toFixed(2).replace('.', ','),
    item.margemAtualPct.toFixed(1).replace('.', ','),
    item.fornecedorSugerido ?? '',
    item.fornecedorMaisBarato ?? '',
    item.precoMaisBarato === null ? '' : item.precoMaisBarato.toFixed(2).replace('.', ','),
    String(item.quantidadeSugerida),
  ]);

  return montarCsv(cabecalho, linhas);
}
