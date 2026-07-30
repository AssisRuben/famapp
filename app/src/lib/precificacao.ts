import { ItemPrecificacao, ProdutoCatalogo, TagPrecificacao } from '../types/domain';
import { calcularMargemPct } from './campanhas';

interface VendaInfo {
  quantidadeVendida30d: number;
  diasSemVenda: number | null;
}

// Quantos dias sem venda já contam como "parado" (referência: relatório
// de excesso do Dose Certa fala em dezenas/centenas de dias parado —
// 14 é um piso conservador, ajustável depois com dado real). Exportado
// pra tela poder explicar o critério com o valor real, sem duplicar o
// número em texto solto.
export const LIMIAR_DIAS_PARADO = 14;

// Uso contínuo/prescrição tolera menos variação de preço que
// conveniência/impulso. produto_catalogo não tem um flag de receita —
// isso vive só em `produtos` (curadoria separada e menor, códigos não
// batem com o catálogo) — então aproxima por categoria. Ajustar essa
// lista se o catálogo real usar nomes de categoria diferentes.
const CATEGORIAS_BAIXA_ELASTICIDADE = new Set(['Medicamentos']);

function round2(valor: number): number {
  return Math.round(valor * 100) / 100;
}

// Percentil simples (nearest-rank) sobre uma lista de números — usado
// pra achar "giro alto"/"margem alta" relativos ao próprio catálogo, em
// vez de um limite fixo que não se adaptaria a um catálogo diferente.
function percentil(valores: number[], p: number): number {
  if (valores.length === 0) return 0;
  const ordenado = [...valores].sort((a, b) => a - b);
  const indice = Math.min(ordenado.length - 1, Math.floor(p * ordenado.length));
  return ordenado[indice];
}

// Três sinais, calculados por item:
// - candidato_reajuste: giro no quartil superior + margem no quartil
//   superior + sem desconto ativo — o produto já vende bem mesmo caro,
//   dá pra testar aumentar um pouco e observar se o volume cai.
// - parado_avaliar_preco: muitos dias sem venda mas AINDA COM ESTOQUE
//   (ruptura é problema de reposição, não de preço — ver aba Compras).
// - baixa/alta_elasticidade: contexto de categoria, não uma ação — só
//   ajuda a calibrar o quanto testar de variação.
export function calcularRelatorioPrecificacao(
  catalogo: ProdutoCatalogo[],
  vendaPorProduto: Map<number, VendaInfo>,
  codigosComDescontoAtivo: Set<number>
): ItemPrecificacao[] {
  const margens = catalogo.map((p) => calcularMargemPct(p.precoVenda, p.custoMedio));
  const giros = catalogo.map((p) => vendaPorProduto.get(p.codigo)?.quantidadeVendida30d ?? 0);
  const margemLimiarAlta = percentil(margens, 0.75);
  const giroLimiarAlto = percentil(giros, 0.75);

  return catalogo.map((produto) => {
    const venda = vendaPorProduto.get(produto.codigo) ?? { quantidadeVendida30d: 0, diasSemVenda: null };
    const margemAtualPct = calcularMargemPct(produto.precoVenda, produto.custoMedio);
    const temDescontoAtivo = codigosComDescontoAtivo.has(produto.codigo);

    const tags: TagPrecificacao[] = [];
    if (venda.quantidadeVendida30d >= giroLimiarAlto && margemAtualPct >= margemLimiarAlta && !temDescontoAtivo) {
      tags.push('candidato_reajuste');
    }
    if (venda.diasSemVenda !== null && venda.diasSemVenda >= LIMIAR_DIAS_PARADO && produto.estoqueAtual > 0) {
      tags.push('parado_avaliar_preco');
    }
    tags.push(CATEGORIAS_BAIXA_ELASTICIDADE.has(produto.categoria) ? 'baixa_elasticidade' : 'alta_elasticidade');

    return {
      produto,
      quantidadeVendida30d: venda.quantidadeVendida30d,
      diasSemVenda: venda.diasSemVenda,
      margemAtualPct: round2(margemAtualPct),
      temDescontoAtivo,
      tags,
    };
  });
}
