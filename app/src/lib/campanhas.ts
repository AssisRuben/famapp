import { ProdutoCatalogo, ProdutoElegibilidade, SugestaoCampanhaParams } from '../types/domain';
import { ehEstoqueParado } from './estoqueParado';
import { macroGrupoDoProduto } from './macroGrupo';

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
  // margemMinimaPct vem de um campo de texto livre na tela — sem
  // clamp, 100 zera o divisor (Infinity) e acima de 100 inverte o
  // sinal (preço mínimo negativo). 95 é o teto prático: margem de
  // 100% significaria custo zero, o que não existe no varejo.
  const margemMinimaSegura = Math.min(95, Math.max(0, margemMinimaPct));
  const precoMinimoPelaMargem = produto.custoMedio / (1 - margemMinimaSegura / 100);
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

// Inverso do modo popularidade: 70% valor parado (custoMedio ×
// estoqueAtual, normalizado) + 30% margem — o objetivo aqui é liberar
// capital parado, então quem tem mais dinheiro preso em estoque some
// pesa mais que a margem (que só entra como desempate de qualidade).
function pontuarLiquidacao(valorParado: number, maxValorParado: number, margemAtualPct: number): number {
  const valorParadoNorm = maxValorParado > 0 ? (valorParado / maxValorParado) * 100 : 0;
  return valorParadoNorm * 0.7 + margemAtualPct * 0.3;
}

export function sugerirCandidatos(
  catalogo: ProdutoCatalogo[],
  vendaRecentePorProduto: Map<number, VendaRecenteInfo>,
  params: SugestaoCampanhaParams,
  codigosParaEvitar: Set<number> = new Set()
): ProdutoElegibilidade[] {
  const modo = params.modo ?? 'popularidade';

  const base = catalogo
    .filter((produto) => !codigosParaEvitar.has(produto.codigo))
    // filtro temático opcional (campanha "Dia do Genérico", "Perfumaria"...).
    .filter((produto) => !params.macroGrupo || macroGrupoDoProduto(produto.grupo) === params.macroGrupo)
    .map((produto) => {
      const venda = vendaRecentePorProduto.get(produto.codigo) ?? { quantidadeVendida30d: 0, diasSemVenda: null };
      const margemAtualPct = calcularMargemPct(produto.precoVenda, produto.custoMedio);
      return { produto, venda, margemAtualPct };
    })
    // margem abaixo do mínimo = descontar isso quebraria a farmácia,
    // fora da lista nos dois modos.
    .filter(({ margemAtualPct }) => margemAtualPct >= params.margemMinimaPct)
    // popularidade: precisa ter vendido no período (senão não há sinal
    // de popularidade nenhum). liquidação: o oposto — precisa estar
    // parado (mesma definição do diagnóstico de Precificação).
    .filter(({ venda, produto }) =>
      modo === 'liquidacao' ? ehEstoqueParado(venda.diasSemVenda, produto.estoqueAtual) : venda.quantidadeVendida30d > 0
    );

  const maxVendida = Math.max(1, ...base.map(({ venda }) => venda.quantidadeVendida30d));
  const maxValorParado = Math.max(1, ...base.map(({ produto }) => produto.custoMedio * produto.estoqueAtual));

  return base
    .map(({ produto, venda, margemAtualPct }) => {
      const sugestao = calcularDescontoSustentavel(produto, params.descontoAlvoPct, params.margemMinimaPct);
      const pontuacao =
        modo === 'liquidacao'
          ? pontuarLiquidacao(produto.custoMedio * produto.estoqueAtual, maxValorParado, margemAtualPct)
          : pontuarCandidato(margemAtualPct, venda.quantidadeVendida30d, maxVendida);
      return {
        produto,
        margemAtualPct: round2(margemAtualPct),
        quantidadeVendida30d: venda.quantidadeVendida30d,
        diasSemVenda: venda.diasSemVenda,
        percentualDescontoSugerido: sugestao.percentualDesconto,
        precoSugerido: sugestao.precoSugerido,
        margemResultantePct: sugestao.margemResultantePct,
        _pontuacao: pontuacao,
      };
    })
    .sort((a, b) => b._pontuacao - a._pontuacao)
    .slice(0, params.quantidadeMaxima)
    .map(({ _pontuacao, ...resto }) => resto);
}
