import { CurvaAbc, DetalheFormulaCompra, ParametrosCompra, ProdutoCatalogo, SugestaoCompra } from '../types/domain';
import { calcularMargemPct } from './campanhas';
import { macroGrupoDoProduto } from './macroGrupo';

export interface DemandaCompraInfo {
  quantidadeVendidaPeriodo: number;
  // Só a fórmula 'inteligente' usa (fn_estatistica_venda_produto):
  quantidadeRecente?: number;
  somaQuadradosDiaria?: number;
  faturamentoPeriodo?: number;
}

export interface ExtrasCompra {
  // produtos em campanha APROVADA (fora do grupo de controle) valendo
  // em algum dia da janela de compra
  codigosEmCampanha?: Set<number>;
  // "já pedi" ainda dentro da previsão de chegada
  pendentes?: Map<number, { quantidade: number; previsaoChegada: string }>;
}

// ---------- Fórmula inteligente (29/09/2026, fase 2 etapa 4) ----------
// Com variação zero, sem tendência, sem campanha e sem pedido pendente,
// dá EXATAMENTE a conta simples: demanda × (segurança + cobertura) −
// estoque. Cada ajuste só soma/subtrai a partir disso.
export const DIAS_TENDENCIA = 14;
// Tendência = últimas 2 semanas × período inteiro, meio a meio, limitada
// a ±50% — um pico de uma semana não pode dobrar a compra.
const PESO_RECENTE = 0.5;
const FATOR_TENDENCIA_MIN = 0.5;
const FATOR_TENDENCIA_MAX = 1.5;
// Com pouca venda a razão recente/período é ruído (1 venda vs 0).
const MIN_UNIDADES_TENDENCIA = 10;
// Aumento pra produto em campanha aprovada. Conservador de propósito:
// a Sprint Vencedor (9% de desconto, 35 produtos) deu +33% de volume; o
// Encarte Setembro, ~0 (achados de 23/09/2026).
export const FATOR_CAMPANHA = 1.2;
// Curva ABC por faturamento no período: A = produtos que somam os
// primeiros 80%, B os próximos 15%, C o resto. Z = nível de serviço
// (A 95%, B 90%, C 80%) — produto que mais fatura ganha colchão maior.
const Z_POR_CURVA: Record<CurvaAbc, number> = { A: 1.65, B: 1.28, C: 0.84 };

function classificarCurvaAbc(demandaPorProduto: Map<number, DemandaCompraInfo>): Map<number, CurvaAbc> {
  const ordenados = [...demandaPorProduto.entries()]
    .map(([codigo, d]) => [codigo, d.faturamentoPeriodo ?? 0] as const)
    .filter(([, faturamento]) => faturamento > 0)
    .sort((a, b) => b[1] - a[1]);
  const total = ordenados.reduce((soma, [, f]) => soma + f, 0);
  const curva = new Map<number, CurvaAbc>();
  let acumulado = 0;
  for (const [codigo, faturamento] of ordenados) {
    // classifica pelo acumulado ANTES do produto: o que cruza os 80% ainda é A
    curva.set(codigo, acumulado < total * 0.8 ? 'A' : acumulado < total * 0.95 ? 'B' : 'C');
    acumulado += faturamento;
  }
  return curva;
}

interface FornecedorInfo {
  fatorCompra: number;
  nomeFornecedor: string | null;
}

interface FornecedorMaisBaratoInfo {
  nomeFornecedor: string;
  precoCusto: number;
}

function round2(valor: number): number {
  return Math.round(valor * 100) / 100;
}

// Estratégia "estoque de segurança": estoqueMinimo cobre diasSeguranca
// de venda (colchão contra ruptura), estoqueAlvo cobre diasSeguranca +
// diasCobertura (o patamar que a compra deve repor até). A quantidade
// sugerida é arredondada pra cima até o múltiplo do fator de compra —
// não dá pra comprar meia caixa do fornecedor.
export function calcularSugestaoCompras(
  catalogo: ProdutoCatalogo[],
  demandaPorProduto: Map<number, DemandaCompraInfo>,
  fornecedorPorProduto: Map<number, FornecedorInfo>,
  fornecedorMaisBaratoPorProduto: Map<number, FornecedorMaisBaratoInfo>,
  params: ParametrosCompra,
  extras: ExtrasCompra = {}
): SugestaoCompra[] {
  const inteligente = params.formula === 'inteligente';
  const curvaPorProduto = inteligente ? classificarCurvaAbc(demandaPorProduto) : new Map<number, CurvaAbc>();
  const diasBase = Math.max(1, params.diasBaseVenda);
  return catalogo
    // AMBULATORIO (aplicação IM, teste de glicemia...), BONIFICACAO e
    // CADASTRO AUTOMATICO ENTR.MERC. não são produto pra repor de
    // fornecedor — são serviço ou ajuste de sistema (mesma classificação
    // "outros_administrativo" de lib/macroGrupo.ts, usada em
    // Precificação). Fora daqui igual "taxa de entrega" já é em
    // supabaseRepository.ts.
    .filter((produto) => macroGrupoDoProduto(produto.grupo) !== 'outros_administrativo')
    // [10/08/2026] Filtro por MACRO-grupo, multi-seleção (ex.: só
    // genérico, ou genérico + similar) — vazio/undefined = todos.
    .filter(
      (produto) =>
        !params.macroGrupos ||
        params.macroGrupos.length === 0 ||
        params.macroGrupos.includes(macroGrupoDoProduto(produto.grupo) ?? '')
    )
    .map((produto) => {
      const demanda = demandaPorProduto.get(produto.codigo);
      const demandaBase = demanda ? demanda.quantidadeVendidaPeriodo / diasBase : 0;

      let demandaMediaDiaria = demandaBase;
      let detalhe: DetalheFormulaCompra | undefined;
      let estoqueSeguranca = 0;
      let quantidadePendente = 0;
      if (inteligente) {
        let fatorTendencia = 1;
        if (demanda && demanda.quantidadeVendidaPeriodo >= MIN_UNIDADES_TENDENCIA && demandaBase > 0) {
          const demandaRecente = (demanda.quantidadeRecente ?? 0) / DIAS_TENDENCIA;
          const razao = Math.min(FATOR_TENDENCIA_MAX, Math.max(FATOR_TENDENCIA_MIN, demandaRecente / demandaBase));
          fatorTendencia = 1 - PESO_RECENTE + PESO_RECENTE * razao;
        }
        const fatorCampanha = extras.codigosEmCampanha?.has(produto.codigo) ? FATOR_CAMPANHA : 1;
        demandaMediaDiaria = demandaBase * fatorTendencia * fatorCampanha;

        // desvio padrão diário com os dias sem venda contando como zero
        const variancia = demanda ? (demanda.somaQuadradosDiaria ?? 0) / diasBase - demandaBase * demandaBase : 0;
        const desvioDiario = Math.sqrt(Math.max(0, variancia));
        const curva = curvaPorProduto.get(produto.codigo) ?? 'C';
        // Teto: no máximo o que os dias de segurança já cobrem (dobra o
        // colchão, nunca mais). Sem isso UMA venda grande atípica (60 un.
        // num dia só, num produto que vende 2/dia) virava colchão de 36 un.
        estoqueSeguranca = Math.min(
          Z_POR_CURVA[curva] * desvioDiario * Math.sqrt(params.diasSeguranca),
          demandaMediaDiaria * params.diasSeguranca
        );

        const pendente = extras.pendentes?.get(produto.codigo);
        quantidadePendente = pendente?.quantidade ?? 0;
        detalhe = {
          demandaBase: round2(demandaBase),
          fatorTendencia: round2(fatorTendencia),
          fatorCampanha,
          curvaAbc: curvaPorProduto.get(produto.codigo) ?? null,
          desvioDiario: round2(desvioDiario),
          estoqueSeguranca: round2(estoqueSeguranca),
          quantidadePendente,
          pendenteAte: pendente?.previsaoChegada ?? null,
        };
      }

      const estoqueMinimo = demandaMediaDiaria * params.diasSeguranca + estoqueSeguranca;
      const estoqueAlvo = demandaMediaDiaria * (params.diasSeguranca + params.diasCobertura) + estoqueSeguranca;

      const fornecedorInfo = fornecedorPorProduto.get(produto.codigo);
      const fatorCompra = fornecedorInfo?.fatorCompra ?? 1;
      const fornecedorMaisBaratoInfo = fornecedorMaisBaratoPorProduto.get(produto.codigo);

      const sugestaoBruta = Math.max(0, estoqueAlvo - produto.estoqueAtual - quantidadePendente);
      const quantidadeSugerida = Math.ceil(sugestaoBruta / fatorCompra) * fatorCompra;

      return {
        codigoProduto: produto.codigo,
        nomeProduto: produto.nome,
        codigoBarras: produto.codigoBarras,
        grupo: produto.grupo ?? '',
        estoqueAtual: produto.estoqueAtual,
        demandaMediaDiaria: round2(demandaMediaDiaria),
        estoqueMinimo: round2(estoqueMinimo),
        estoqueAlvo: round2(estoqueAlvo),
        fatorCompra,
        custoMedio: produto.custoMedio,
        precoVenda: produto.precoVenda,
        margemAtualPct: round2(calcularMargemPct(produto.precoVenda, produto.custoMedio)),
        fornecedorSugerido: fornecedorInfo?.nomeFornecedor ?? null,
        fornecedorMaisBarato: fornecedorMaisBaratoInfo?.nomeFornecedor ?? null,
        precoMaisBarato: fornecedorMaisBaratoInfo?.precoCusto ?? null,
        quantidadeSugerida,
        ...(detalhe ? { detalhe } : {}),
      };
    })
    // sem necessidade de repor não entra na lista — evita poluir a
    // sugestão com o catálogo inteiro quando só uma fração precisa de compra.
    .filter((s) => s.quantidadeSugerida > 0)
    // maior valor de compra primeiro — é o que mais pesa no caixa, então
    // é o que o gestor deveria revisar antes.
    .sort((a, b) => b.quantidadeSugerida * b.custoMedio - a.quantidadeSugerida * a.custoMedio);
}

// "Por que essa quantidade" em uma linha, só com o que mudou a conta
// (fórmula inteligente). Vazio = deu a mesma conta da fórmula simples.
export function explicarQuantidade(detalhe: DetalheFormulaCompra): string {
  const partes: string[] = [];
  const pct = (fator: number) => `${fator > 1 ? '+' : ''}${Math.round((fator - 1) * 100)}%`;
  if (detalhe.fatorTendencia !== 1) {
    partes.push(`venda ${detalhe.fatorTendencia > 1 ? 'subindo' : 'caindo'} nas últimas 2 semanas (${pct(detalhe.fatorTendencia)})`);
  }
  if (detalhe.fatorCampanha !== 1) partes.push(`em campanha aprovada (${pct(detalhe.fatorCampanha)})`);
  if (detalhe.estoqueSeguranca >= 0.5) {
    partes.push(`+${Math.round(detalhe.estoqueSeguranca)} un. de colchão pela variação da venda${detalhe.curvaAbc ? ` (curva ${detalhe.curvaAbc})` : ''}`);
  }
  if (detalhe.quantidadePendente > 0) {
    const [, mes, dia] = (detalhe.pendenteAte ?? '').split('-');
    partes.push(`−${detalhe.quantidadePendente} un. já pedidas${dia ? ` (chegam até ${dia}/${mes})` : ''}`);
  }
  return partes.join(' · ');
}
