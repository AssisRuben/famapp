import { ProdutoCatalogo, ProdutoElegibilidade, SugestaoCampanhaParams } from '../types/domain';

interface VendaRecenteInfo {
  quantidadeVendida30d: number;
  diasSemVenda: number | null;
}

function round2(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export function calcularMargemPct(precoVenda: number, custo: number): number {
  if (precoVenda <= 0) return 0;
  return ((precoVenda - custo) / precoVenda) * 100;
}

// Desconto sustentável: o maior desconto que ainda deixa a margem
// resultante >= margem mínima configurada (nunca deixa vender no
// prejuízo, mesmo que o desconto alvo pedido seja mais agressivo).
export function calcularDescontoSustentavel(
  produto: ProdutoCatalogo,
  descontoAlvoPct: number,
  margemMinimaPct: number
): { percentualDesconto: number; precoSugerido: number; margemResultantePct: number } {
  const precoMinimoPelaMargem = produto.custoMedio / (1 - margemMinimaPct / 100);
  const precoComDescontoAlvo = produto.precoVenda * (1 - descontoAlvoPct / 100);
  const precoSugerido = Math.max(precoComDescontoAlvo, precoMinimoPelaMargem, produto.custoMedio);
  const percentualDesconto = Math.max(0, ((produto.precoVenda - precoSugerido) / produto.precoVenda) * 100);
  return {
    percentualDesconto: round2(percentualDesconto),
    precoSugerido: round2(precoSugerido),
    margemResultantePct: round2(calcularMargemPct(precoSugerido, produto.custoMedio)),
  };
}

// 60% margem + 40% popularidade normalizada — prioriza quem sustenta
// desconto de verdade E já vende bem (reforça sucesso, não tenta
// "adivinhar" se um produto parado vai deslanchar).
function pontuarCandidato(margemAtualPct: number, quantidadeVendida30d: number, maxVendida: number): number {
  const popularidadeNorm = maxVendida > 0 ? (quantidadeVendida30d / maxVendida) * 100 : 0;
  return margemAtualPct * 0.6 + popularidadeNorm * 0.4;
}

export function sugerirCandidatos(
  catalogo: ProdutoCatalogo[],
  vendaRecentePorProduto: Map<number, VendaRecenteInfo>,
  params: SugestaoCampanhaParams,
  codigosParaEvitar: Set<number> = new Set()
): ProdutoElegibilidade[] {
  const maxVendida = Math.max(1, ...catalogo.map((p) => vendaRecentePorProduto.get(p.codigo)?.quantidadeVendida30d ?? 0));

  return catalogo
    .filter((produto) => !codigosParaEvitar.has(produto.codigo))
    .map((produto) => {
      const venda = vendaRecentePorProduto.get(produto.codigo) ?? { quantidadeVendida30d: 0, diasSemVenda: null };
      const margemAtualPct = calcularMargemPct(produto.precoVenda, produto.custoMedio);
      return { produto, venda, margemAtualPct };
    })
    // sem venda no período = sem sinal de popularidade; margem abaixo
    // do mínimo = descontar isso quebraria a farmácia. Os dois ficam
    // fora da lista de candidatos.
    .filter(({ venda, margemAtualPct }) => venda.quantidadeVendida30d > 0 && margemAtualPct >= params.margemMinimaPct)
    .map(({ produto, venda, margemAtualPct }) => {
      const sugestao = calcularDescontoSustentavel(produto, params.descontoAlvoPct, params.margemMinimaPct);
      return {
        produto,
        margemAtualPct: round2(margemAtualPct),
        quantidadeVendida30d: venda.quantidadeVendida30d,
        diasSemVenda: venda.diasSemVenda,
        percentualDescontoSugerido: sugestao.percentualDesconto,
        precoSugerido: sugestao.precoSugerido,
        margemResultantePct: sugestao.margemResultantePct,
        _pontuacao: pontuarCandidato(margemAtualPct, venda.quantidadeVendida30d, maxVendida),
      };
    })
    .sort((a, b) => b._pontuacao - a._pontuacao)
    .slice(0, params.quantidadeMaxima)
    .map(({ _pontuacao, ...resto }) => resto);
}
