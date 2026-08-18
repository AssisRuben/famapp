import { CampanhaComplementar, OfertaComplementarDia, VendaComplementarMarcada, VendedorAtivo } from '../types/domain';

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

export interface ResultadoDiaVendedor {
  codigoVendedor: number;
  nomeVendedor: string;
  // null = vendedor não informou nesse dia (não é "informou zero").
  clientesOfertados: number | null;
  quantidadeItens: number;
  valorVenda: number;
}

export interface ResultadoDiaCampanha {
  data: string;
  itens: ResultadoDiaVendedor[];
}

// Resultado salvo de TODOS os vendedores por dia dentro do período da
// campanha — diferente de calcularRankingComplementar (só quem bateu o
// piso, somado no período todo): aqui é o dado bruto dia a dia, pra dar
// visibilidade mesmo quando ninguém bateu a meta ainda.
export function agruparResultadoComplementarPorDia(
  vendas: VendaComplementarMarcada[],
  ofertas: OfertaComplementarDia[],
  vendedores: VendedorAtivo[]
): ResultadoDiaCampanha[] {
  const nomePorCodigo = new Map(vendedores.map((v) => [v.codigo, v.nome]));
  const porData = new Map<string, Map<number, ResultadoDiaVendedor>>();

  const linhaDe = (data: string, codigoVendedor: number, nomeVendedor: string) => {
    if (!porData.has(data)) porData.set(data, new Map());
    const porVendedor = porData.get(data)!;
    if (!porVendedor.has(codigoVendedor)) {
      porVendedor.set(codigoVendedor, {
        codigoVendedor,
        nomeVendedor,
        clientesOfertados: null,
        quantidadeItens: 0,
        valorVenda: 0,
      });
    }
    return porVendedor.get(codigoVendedor)!;
  };

  for (const v of vendas) {
    const linha = linhaDe(v.dataVenda, v.codigoVendedor, v.nomeVendedor);
    linha.quantidadeItens += 1;
    linha.valorVenda += v.valor;
  }
  for (const o of ofertas) {
    const nome = nomePorCodigo.get(o.codigoVendedor) ?? `Vendedor ${o.codigoVendedor}`;
    const linha = linhaDe(o.data, o.codigoVendedor, nome);
    linha.clientesOfertados = o.clientesOfertados;
  }

  return Array.from(porData.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([data, porVendedor]) => ({
      data,
      itens: Array.from(porVendedor.values()).sort((a, b) => a.nomeVendedor.localeCompare(b.nomeVendedor)),
    }));
}

// Mesmo resultado de agruparResultadoComplementarPorDia, mas somado no
// período inteiro por vendedor (clientesOfertados aqui é a SOMA das
// contagens diárias, não um valor único) — usado como "total do
// período" logo abaixo do dia aberto, pra dar o acumulado sem precisar
// somar cada dia na mão.
export function totalComplementarPorVendedor(
  vendas: VendaComplementarMarcada[],
  ofertas: OfertaComplementarDia[],
  vendedores: VendedorAtivo[]
): ResultadoDiaVendedor[] {
  const nomePorCodigo = new Map(vendedores.map((v) => [v.codigo, v.nome]));
  const porVendedor = new Map<number, ResultadoDiaVendedor>();

  const linhaDe = (codigoVendedor: number, nomeVendedor: string) => {
    if (!porVendedor.has(codigoVendedor)) {
      porVendedor.set(codigoVendedor, {
        codigoVendedor,
        nomeVendedor,
        clientesOfertados: null,
        quantidadeItens: 0,
        valorVenda: 0,
      });
    }
    return porVendedor.get(codigoVendedor)!;
  };

  for (const v of vendas) {
    const linha = linhaDe(v.codigoVendedor, v.nomeVendedor);
    linha.quantidadeItens += 1;
    linha.valorVenda += v.valor;
  }
  for (const o of ofertas) {
    const nome = nomePorCodigo.get(o.codigoVendedor) ?? `Vendedor ${o.codigoVendedor}`;
    const linha = linhaDe(o.codigoVendedor, nome);
    linha.clientesOfertados = (linha.clientesOfertados ?? 0) + o.clientesOfertados;
  }

  return Array.from(porVendedor.values()).sort((a, b) => b.valorVenda - a.valorVenda);
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
