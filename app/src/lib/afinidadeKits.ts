import { ProdutoCatalogo, SugestaoParAfinidade } from '../types/domain';
import { macroGrupoDoProduto } from './macroGrupo';

// Motor da sugestão de kit por afinidade — mesmo papel que
// lib/campanhas.ts tem pro fluxo "Personalizado" de Campanhas, mas
// aqui o trabalho pesado (achar pares que co-ocorrem na mesma venda)
// é feito no banco (fn_sugerir_pares_afinidade); esse arquivo só cuida
// da parte que só existe em TS: resolver quais códigos de produto
// entram como "semente" da categoria escolhida, e juntar o resultado
// numérico da RPC com nome/preço/custo já carregados em memória.

// Mesma técnica de sugerirCandidatos (lib/campanhas.ts) — filtra o
// catálogo já carregado pelo macro-grupo escolhido.
export function resolverCodigosSeed(catalogo: ProdutoCatalogo[], macroGrupo: string): number[] {
  return catalogo.filter((p) => macroGrupoDoProduto(p.grupo) === macroGrupo).map((p) => p.codigo);
}

// Linha crua vinda de supabase.rpc('fn_sugerir_pares_afinidade', ...).
export interface LinhaRpcAfinidade {
  codigo_produto_seed: number;
  codigo_produto_parceiro: number;
  co_ocorrencias: number;
  vendas_seed: number;
  vendas_parceiro: number;
  lift: number;
}

export function mapearSugestoesAfinidade(
  linhas: LinhaRpcAfinidade[],
  catalogoPorCodigo: Map<number, ProdutoCatalogo>
): SugestaoParAfinidade[] {
  const sugestoes: SugestaoParAfinidade[] = [];
  for (const linha of linhas) {
    const seed = catalogoPorCodigo.get(linha.codigo_produto_seed);
    const parceiro = catalogoPorCodigo.get(linha.codigo_produto_parceiro);
    // Produto pode ter sumido do catálogo (descontinuado) entre a
    // venda histórica e hoje — sem nome/preço atual não dá pra montar
    // kit, então essas linhas ficam de fora em vez de quebrar a tela.
    if (!seed || !parceiro) continue;
    sugestoes.push({
      codigoProdutoSeed: seed.codigo,
      nomeProdutoSeed: seed.nome,
      precoRegularSeed: seed.precoVenda,
      custoMedioSeed: seed.custoMedio,
      codigoProdutoParceiro: parceiro.codigo,
      nomeProdutoParceiro: parceiro.nome,
      precoRegularParceiro: parceiro.precoVenda,
      custoMedioParceiro: parceiro.custoMedio,
      coOcorrencias: Number(linha.co_ocorrencias),
      vendasSeed: Number(linha.vendas_seed),
      vendasParceiro: Number(linha.vendas_parceiro),
      lift: Number(linha.lift),
    });
  }
  return sugestoes;
}
