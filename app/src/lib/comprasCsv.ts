import { SugestaoCompra } from '../types/domain';

function escaparCampoCsv(valor: string): string {
  if (/[";\n]/.test(valor)) {
    return `"${valor.replace(/"/g, '""')}"`;
  }
  return valor;
}

// Colunas iguais ao que existe de fato: sem prazo de entrega/última
// cotação porque a API não expõe esses campos (ver lib/doseCerta.ts).
export function gerarCsvSugestaoCompras(itens: SugestaoCompra[]): string {
  const cabecalho = [
    'Código',
    'Código de barras',
    'Produto',
    'Categoria',
    'Estoque atual',
    'Estoque alvo',
    'Fator de compra',
    'Custo médio',
    'Preço de venda',
    'Margem (%)',
    'Fornecedor sugerido',
    'Quantidade a comprar',
  ];

  const linhas = itens.map((item) =>
    [
      String(item.codigoProduto),
      item.codigoBarras,
      item.nomeProduto,
      item.categoria,
      String(item.estoqueAtual),
      String(item.estoqueAlvo),
      String(item.fatorCompra),
      item.custoMedio.toFixed(2).replace('.', ','),
      item.precoVenda.toFixed(2).replace('.', ','),
      item.margemAtualPct.toFixed(1).replace('.', ','),
      item.fornecedorSugerido ?? '',
      String(item.quantidadeSugerida),
    ]
      .map(escaparCampoCsv)
      .join(';')
  );

  return [cabecalho.join(';'), ...linhas].join('\n');
}
