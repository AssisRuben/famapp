import { CampanhaComplementar, VendaComplementarMarcada } from '../types/domain';

export interface RankingComplementarItem {
  codigoVendedor: number;
  nomeVendedor: string;
  valorTotal: number;
  quantidadeTotal: number;
  posicao: number;
  premio: number | null;
}

// Mesmo padrão de calcularRankingVendaAdicional: soma por vendedor,
// aplica os pisos (valorMinimo em R$ e quantidadeMinima em nº de itens
// — independentes, quem tem os dois configurados precisa bater ambos),
// ordena desc por valor e casa a posição com premiacaoRanking.
export function calcularRankingComplementar(
  vendas: VendaComplementarMarcada[],
  campanha: CampanhaComplementar
): RankingComplementarItem[] {
  const premios = campanha.premiacaoRanking ?? [];
  const valorMinimo = campanha.valorMinimo ?? 0;
  const quantidadeMinima = campanha.quantidadeMinima ?? 0;

  const porVendedor = new Map<number, { nomeVendedor: string; valorTotal: number; quantidadeTotal: number }>();
  for (const v of vendas) {
    const atual = porVendedor.get(v.codigoVendedor) ?? { nomeVendedor: v.nomeVendedor, valorTotal: 0, quantidadeTotal: 0 };
    atual.valorTotal += v.valor;
    atual.quantidadeTotal += 1;
    porVendedor.set(v.codigoVendedor, atual);
  }

  return Array.from(porVendedor.entries())
    .map(([codigoVendedor, item]) => ({ codigoVendedor, ...item }))
    .filter((item) => item.valorTotal >= valorMinimo && item.quantidadeTotal >= quantidadeMinima)
    .sort((a, b) => b.valorTotal - a.valorTotal)
    .map((item, index) => {
      const posicao = index + 1;
      return { ...item, posicao, premio: premios.find((p) => p.posicao === posicao)?.valor ?? null };
    });
}

// Resumo "Dipirona 500mg (2x), Vitamina C" dos produtos que um
// vendedor marcou no período — usado no "ver ranking" pra mostrar não
// só quanto ele vendeu, mas O QUE.
export function produtosMarcadosPorVendedor(vendas: VendaComplementarMarcada[], codigoVendedor: number): string {
  const porProduto = new Map<string, number>();
  for (const v of vendas) {
    if (v.codigoVendedor !== codigoVendedor) continue;
    porProduto.set(v.nomeProduto, (porProduto.get(v.nomeProduto) ?? 0) + 1);
  }
  return [...porProduto.entries()].map(([nome, qtd]) => (qtd > 1 ? `${nome} (${qtd}x)` : nome)).join(', ');
}
