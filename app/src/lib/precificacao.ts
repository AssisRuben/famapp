import { ItemEstoqueZeradoGiroAlto, ItemPrecificacao, ProdutoCatalogo, TagPrecificacao } from '../types/domain';
import { calcularMargemPct } from './campanhas';
import { ehEstoqueParado, LIMIAR_DIAS_PARADO } from './estoqueParado';
import { ehBaixaElasticidade } from './elasticidade';
import { macroGrupoDoProduto } from './macroGrupo';

// re-exportado por conveniência — telas que já importam o limiar daqui
// (PrecificacaoScreen) não precisam saber que ele mora em estoqueParado.ts.
export { LIMIAR_DIAS_PARADO };

interface VendaInfo {
  quantidadeVendida30d: number;
  diasSemVenda: number | null;
}

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
    if (ehEstoqueParado(venda.diasSemVenda, produto.estoqueAtual)) {
      tags.push('parado_avaliar_preco');
    }
    tags.push(ehBaixaElasticidade(produto.grupo, produto.tipoLista) ? 'baixa_elasticidade' : 'alta_elasticidade');

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

// Espelha a query SQL do node "Buscar produtos de giro alto zerados" —
// percentil calculado sobre TODO o catálogo com venda recente (não só
// os zerados), estoque_atual = 0 filtrado só depois. 'outros_administrativo'
// cobre o mesmo universo do "not like TAXA" + regex de grupo do SQL
// (ver comentário em ComprasScreen.tsx: esse macro nunca é produto de verdade).
export function calcularEstoqueZeradoGiroAlto(
  catalogo: ProdutoCatalogo[],
  vendaPorProduto: Map<number, VendaInfo>
): ItemEstoqueZeradoGiroAlto[] {
  const vendidos = catalogo
    .map((p) => vendaPorProduto.get(p.codigo)?.quantidadeVendida30d ?? 0)
    .filter((q) => q > 0);
  const giroLimiarAlto = percentil(vendidos, 0.8);

  return catalogo
    .filter((p) => p.estoqueAtual === 0)
    .filter((p) => macroGrupoDoProduto(p.grupo) !== 'outros_administrativo')
    .filter((p) => !p.nome.toUpperCase().includes('TAXA'))
    .map((p) => ({
      codigoProduto: p.codigo,
      nomeProduto: p.nome,
      quantidadeVendida30d: vendaPorProduto.get(p.codigo)?.quantidadeVendida30d ?? 0,
    }))
    .filter((p) => p.quantidadeVendida30d > 0 && p.quantidadeVendida30d >= giroLimiarAlto)
    .sort((a, b) => b.quantidadeVendida30d - a.quantidadeVendida30d);
}
