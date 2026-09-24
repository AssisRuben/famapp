import { ModeloCampanha, ProdutoCatalogo, ProdutoElegibilidade, SugestaoCampanhaParams } from '../types/domain';
import { ehEstoqueParado } from './estoqueParado';
import { ehBaixaElasticidade } from './elasticidade';
import { macroGrupoDoProduto, MacroGrupo } from './macroGrupo';

const MACROS_MEDICAMENTO: MacroGrupo[] = ['eticos', 'genericos', 'similares'];

// Dias sem venda pra "estoque parado 60+ dias" (campanha fixa,
// 18/08/2026) — limiar próprio, mais rígido que o LIMIAR_DIAS_PARADO
// genérico (14 dias) usado no modo "liquidação"/Precificação.
const LIMIAR_DIAS_ESTOQUE_PARADO_CAMPANHA = 60;

// Filtro específico de cada modelo de campanha fixo — decide se o
// produto É CANDIDATO ao tema (a pontuação/ordenação continua vindo de
// pontuarCandidato/pontuarLiquidacao logo abaixo, não daqui).
function passaNoFiltroDoModelo(modelo: ModeloCampanha, produto: ProdutoCatalogo, diasSemVenda: number | null): boolean {
  const macro = macroGrupoDoProduto(produto.grupo);
  const nomeNormalizado = produto.nome.toUpperCase();
  switch (modelo) {
    case 'estoque_parado_60':
      return diasSemVenda !== null && diasSemVenda >= LIMIAR_DIAS_ESTOQUE_PARADO_CAMPANHA && produto.estoqueAtual > 0;
    case 'mips':
      // medicamento que não exige receita (aproximação — a Trier não
      // manda um flag "isso é MIPS" pronto, ver comentário em domain.ts).
      return !!macro && MACROS_MEDICAMENTO.includes(macro) && !produto.tipoLista?.trim();
    case 'nao_medicamentos':
      return !!macro && !MACROS_MEDICAMENTO.includes(macro) && macro !== 'outros_administrativo';
    case 'desodorantes':
      // sem subcategoria própria no catálogo — precisa ser por nome. O
      // catálogo da Trier abrevia ("DES DOVE AER...", "+DESOD"), quase
      // nunca escreve DESODORANTE inteiro (conferido no banco 23/09/2026).
      // Palavra inteira pra não pegar "ADES" (adesivo de dentadura).
      return /(^|[^A-Z])DES(OD[A-Z]*)?([^A-Z]|$)/.test(nomeNormalizado);
    case 'bebe_idoso':
      return ehProdutoBebeIdoso(nomeNormalizado);
  }
}

// Bebê & Idoso por NOME, não por grupo (23/09/2026): no catálogo real
// quase tudo fora fralda está em PERFUMARIA/ETICO/SIMILAR/LEITES (lenço
// umedecido, Johnson's Baby, Hipoglos, Nutra Senior...), e o grupo
// FRALDAS também tem absorvente feminino — o filtro antigo por grupo
// devolvia só fralda. Tokens conferidos contra o catálogo.
const PALAVRAS_BEBE_IDOSO = new Set([
  'BABY', 'BEBE', 'BEBES', 'KIDS', 'KID', 'INF', 'INFAN', 'INFANT', 'INFANTIL',
  'FR', 'HIPOGLOS', 'ASSAD', 'GERIAT', 'GERIATRICA', 'GERIATRICO', 'GERIAMAX', 'GER',
  'SENIOR', 'TENA', 'PLENITUD', 'COREGA', 'DENTALFIX',
]);
const TRECHOS_BEBE_IDOSO = ['LENC UME', 'TOALHA UMED', 'ROUP INT', 'POS PARTO', 'ABS SEIOS', 'CR PREV'];
// NBCAL (Lei 11.265/2006): fórmula infantil, mamadeira, bico e chupeta
// não podem ter promoção comercial.
const PALAVRAS_PROIBIDAS_NBCAL = new Set(['MAMAD', 'MAMADEIRA', 'CHUPETA', 'APTAMIL', 'NAN', 'NESTOGENO', 'ENFAMIL', 'MILNUTRI']);
const TRECHOS_PROIBIDOS_NBCAL = ['BICO MAM'];

function ehProdutoBebeIdoso(nomeNormalizado: string): boolean {
  const palavras = nomeNormalizado.split(/[^A-Z0-9]+/).filter(Boolean);
  if (palavras.some((p) => PALAVRAS_PROIBIDAS_NBCAL.has(p))) return false;
  if (TRECHOS_PROIBIDOS_NBCAL.some((t) => nomeNormalizado.includes(t))) return false;
  // perfume adulto ("PERF MENS CLUB 52 INF") e absorvente feminino
  // (ABS INTIMUS/DIANA...) não são do tema — absorvente só entra se
  // for geriátrico/pós-parto/amamentação (pegos pelas listas acima).
  if (palavras[0] === 'PERF') return false;
  const casou = palavras.some((p) => PALAVRAS_BEBE_IDOSO.has(p)) || TRECHOS_BEBE_IDOSO.some((t) => nomeNormalizado.includes(t));
  if (!casou) return false;
  if (palavras[0] === 'ABS') {
    return palavras.some((p) => ['GER', 'GERIAMAX', 'TENA'].includes(p)) || nomeNormalizado.includes('POS PARTO') || nomeNormalizado.includes('ABS SEIOS');
  }
  return true;
}

function exigeReceita(produto: ProdutoCatalogo): boolean {
  const grupo = (produto.grupo ?? '').toUpperCase();
  return !!produto.tipoLista?.trim() || grupo.includes('CONTROLAD') || grupo.includes('ANTIMICROB');
}

// Abaixo disso a "promoção" não muda o preço de verdade — acontece
// quando a margem atual está colada na margem mínima (o piso da margem
// come o desconto inteiro). Cartaz com 0% não serve pra nada.
const DESCONTO_MINIMO_SUGESTAO_PCT = 1;

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
  // precoVenda (tabela da Trier) é frequentemente fictício — genérico
  // real chega a sair a 30% da tabela por desconto padrão de balcão não
  // registrado no cadastro (achado 23/09/2026). precoPraticado (mediana
  // real paga, ver vw_preco_praticado_atual) é a referência certa pra
  // decidir desconto; sem isso o "desconto sugerido" podia virar aumento
  // de preço disfarçado (achado real: Losartana tabela R$24,45, preço
  // de fato praticado R$4,57 — sugestão de "R$22,49 promocional" teria
  // sido 5x o preço real).
  const precoReferencia = produto.precoPraticado ?? produto.precoVenda;
  const margemMinimaSegura = Math.min(95, Math.max(0, margemMinimaPct));
  const precoMinimoPelaMargem = produto.custoMedio / (1 - margemMinimaSegura / 100);
  const precoComDescontoAlvo = precoReferencia * (1 - descontoAlvoPct / 100);
  const precoSugerido = Math.max(precoComDescontoAlvo, precoMinimoPelaMargem, produto.custoMedio);
  const percentualDesconto = Math.max(0, ((precoReferencia - precoSugerido) / precoReferencia) * 100);
  return {
    percentualDesconto: round2(percentualDesconto),
    precoSugerido: round2(precoSugerido),
    margemResultantePct: round2(calcularMargemPct(precoSugerido, produto.custoMedio)),
  };
}

// 50% margem + 30% popularidade normalizada + 20% elasticidade —
// prioriza quem sustenta desconto de verdade E já vende bem E responde
// a promoção de verdade. [18/08/2026] Pesos antigos eram 60/40 margem/
// popularidade, redistribuídos pra abrir espaço pro sinal de
// elasticidade sem zerar os dois que já existiam. Baixa elasticidade
// não é DESCARTADA (ainda pode entrar se pontuar bem nos outros dois),
// só pesa menos — descontar um produto de baixa elasticidade não é
// necessariamente errado, só menos eficiente pra gerar volume extra.
function pontuarCandidato(
  margemAtualPct: number,
  quantidadeVendida30d: number,
  maxVendida: number,
  altaElasticidade: boolean
): number {
  const popularidadeNorm = maxVendida > 0 ? (quantidadeVendida30d / maxVendida) * 100 : 0;
  return margemAtualPct * 0.5 + popularidadeNorm * 0.3 + (altaElasticidade ? 100 : 0) * 0.2;
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
  // Modelo fixo (18/08/2026) sobrepõe modo/macroGrupo — cada modelo já
  // decide sua própria regra de seleção (passaNoFiltroDoModelo) e usa a
  // pontuação equivalente ao modo mais parecido (estoque_parado_60 ~
  // liquidação; os outros 4, temáticos, ~ popularidade).
  const modo = params.modelo ? (params.modelo === 'estoque_parado_60' ? 'liquidacao' : 'popularidade') : params.modo ?? 'popularidade';

  const base = catalogo
    .filter((produto) => !codigosParaEvitar.has(produto.codigo))
    // sem estoque não tem como atender a promoção (23/09/2026) — vale
    // pra todo modo/modelo, inclusive as sugestões de kit.
    .filter((produto) => produto.estoqueAtual > 0)
    // remédio que exige receita (controlado, antimicrobiano, tarja com
    // tipoLista) não pode ter promoção — estava vindo Venvanse no
    // estoque parado 60+ (23/09/2026). Vale pra todo modo/modelo.
    .filter((produto) => !exigeReceita(produto))
    // filtro temático opcional (campanha "Dia do Genérico", "Perfumaria"...)
    // — só quando NÃO há modelo fixo (modelo tem o próprio filtro abaixo).
    .filter((produto) => params.modelo || !params.macroGrupo || macroGrupoDoProduto(produto.grupo) === params.macroGrupo)
    .map((produto) => {
      const venda = vendaRecentePorProduto.get(produto.codigo) ?? { quantidadeVendida30d: 0, diasSemVenda: null };
      const margemAtualPct = calcularMargemPct(produto.precoPraticado ?? produto.precoVenda, produto.custoMedio);
      return { produto, venda, margemAtualPct };
    })
    // margem abaixo do mínimo = descontar isso quebraria a farmácia,
    // fora da lista em qualquer modo/modelo.
    .filter(({ margemAtualPct }) => margemAtualPct >= params.margemMinimaPct)
    .filter(({ venda, produto }) => {
      if (params.modelo) {
        if (!passaNoFiltroDoModelo(params.modelo, produto, venda.diasSemVenda)) return false;
        // estoque_parado_60 já exige diasSemVenda>=60 dentro do próprio
        // filtro (não faz sentido também exigir venda>0); os modelos
        // temáticos continuam exigindo sinal real de venda recente.
        return params.modelo === 'estoque_parado_60' || venda.quantidadeVendida30d > 0;
      }
      // popularidade: precisa ter vendido no período (senão não há sinal
      // de popularidade nenhum). liquidação: o oposto — precisa estar
      // parado (mesma definição do diagnóstico de Precificação).
      return modo === 'liquidacao' ? ehEstoqueParado(venda.diasSemVenda, produto.estoqueAtual) : venda.quantidadeVendida30d > 0;
    });

  const maxVendida = Math.max(1, ...base.map(({ venda }) => venda.quantidadeVendida30d));
  const maxValorParado = Math.max(1, ...base.map(({ produto }) => produto.custoMedio * produto.estoqueAtual));

  return base
    .map(({ produto, venda, margemAtualPct }) => {
      const sugestao = calcularDescontoSustentavel(produto, params.descontoAlvoPct, params.margemMinimaPct);
      const pontuacao =
        modo === 'liquidacao'
          ? pontuarLiquidacao(produto.custoMedio * produto.estoqueAtual, maxValorParado, margemAtualPct)
          : pontuarCandidato(
              margemAtualPct,
              venda.quantidadeVendida30d,
              maxVendida,
              !ehBaixaElasticidade(produto.grupo, produto.tipoLista)
            );
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
    .filter((candidato) => candidato.percentualDescontoSugerido >= DESCONTO_MINIMO_SUGESTAO_PCT)
    .sort((a, b) => b._pontuacao - a._pontuacao)
    .slice(0, params.quantidadeMaxima)
    .map(({ _pontuacao, ...resto }) => resto);
}
