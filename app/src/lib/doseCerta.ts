import { ParametrosCompra, ProdutoCatalogo, SugestaoCompra } from '../types/domain';
import { calcularMargemPct } from './campanhas';
import { macroGrupoDoProduto } from './macroGrupo';

interface DemandaInfo {
  quantidadeVendidaPeriodo: number;
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
  demandaPorProduto: Map<number, DemandaInfo>,
  fornecedorPorProduto: Map<number, FornecedorInfo>,
  fornecedorMaisBaratoPorProduto: Map<number, FornecedorMaisBaratoInfo>,
  params: ParametrosCompra
): SugestaoCompra[] {
  return catalogo
    // AMBULATORIO (aplicação IM, teste de glicemia...), BONIFICACAO e
    // CADASTRO AUTOMATICO ENTR.MERC. não são produto pra repor de
    // fornecedor — são serviço ou ajuste de sistema (mesma classificação
    // "outros_administrativo" de lib/macroGrupo.ts, usada em
    // Precificação). Fora daqui igual "taxa de entrega" já é em
    // supabaseRepository.ts.
    .filter((produto) => macroGrupoDoProduto(produto.grupo) !== 'outros_administrativo')
    .filter((produto) => !params.grupo || produto.grupo === params.grupo)
    .map((produto) => {
      const demanda = demandaPorProduto.get(produto.codigo);
      const demandaMediaDiaria = demanda ? demanda.quantidadeVendidaPeriodo / Math.max(1, params.diasBaseVenda) : 0;
      const estoqueMinimo = demandaMediaDiaria * params.diasSeguranca;
      const estoqueAlvo = demandaMediaDiaria * (params.diasSeguranca + params.diasCobertura);

      const fornecedorInfo = fornecedorPorProduto.get(produto.codigo);
      const fatorCompra = fornecedorInfo?.fatorCompra ?? 1;
      const fornecedorMaisBaratoInfo = fornecedorMaisBaratoPorProduto.get(produto.codigo);

      const sugestaoBruta = Math.max(0, estoqueAlvo - produto.estoqueAtual);
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
      };
    })
    // sem necessidade de repor não entra na lista — evita poluir a
    // sugestão com o catálogo inteiro quando só uma fração precisa de compra.
    .filter((s) => s.quantidadeSugerida > 0)
    // maior valor de compra primeiro — é o que mais pesa no caixa, então
    // é o que o gestor deveria revisar antes.
    .sort((a, b) => b.quantidadeSugerida * b.custoMedio - a.quantidadeSugerida * a.custoMedio);
}
