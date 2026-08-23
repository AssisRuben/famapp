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
// ordena desc por valor e numera a posição de TODO MUNDO que marcou
// alguma coisa (transparência do ranqueamento completo — pedido
// explícito 21/08/2026, mesma decisão tomada pra Venda Adicional:
// antes, quem não batia os pisos de valor/quantidade sumia inteiro do
// ranking, e campanha encerrada sem ninguém bater o piso aparecia
// vazia mesmo com venda marcada, parecendo quebrada). Os pisos
// (valorMinimo em R$ e quantidadeMinima em nº de itens — independentes,
// quem tem os dois configurados precisa bater ambos) continuam
// decidindo só quem GANHA o prêmio.
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
    .sort((a, b) => b.valorTotal - a.valorTotal)
    .map((item, index) => {
      const posicao = index + 1;
      const concorre = item.valorTotal >= valorMinimo && item.quantidadeTotal >= quantidadeMinima;
      return { ...item, posicao, premio: concorre ? premios.find((p) => p.posicao === posicao)?.valor ?? null : null };
    });
}

// Medalha/troféu pra quem realmente ganhou prêmio numa posição (não só
// quem está naquela posição no ranking — dá pra estar em 1º sem
// prêmio se não bateu os pisos). Chamar só quando premio != null.
export function medalhaPosicaoComplementar(posicao: number): string {
  if (posicao === 1) return '🥇';
  if (posicao === 2) return '🥈';
  if (posicao === 3) return '🥉';
  return '🏆';
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

export interface DiaVendedorComplementar {
  data: string;
  quantidadeItens: number;
  valorVenda: number;
  // "Dipirona 500mg (2x), Vitamina C" — já formatado, um item por
  // produto distinto naquele dia.
  produtos: string;
}

// Vendas de UM vendedor, agrupadas por dia — usado no "Ver ranking"
// (21/08/2026): mostrar a lista inteira de produtos marcados no
// período todo, tudo junto e sem estrutura, ficava ilegível pra quem
// marca bastante coisa (achado com dado real: mais de 30 produtos numa
// linha só). Lista por dia primeiro (nº de vendas + valor); os
// produtos em si só aparecem quando clica no dia.
export function agruparVendasPorDiaDoVendedor(
  vendas: VendaComplementarMarcada[],
  codigoVendedor: number
): DiaVendedorComplementar[] {
  const porDia = new Map<string, { quantidadeItens: number; valorVenda: number; produtos: Map<string, number> }>();
  for (const v of vendas) {
    if (v.codigoVendedor !== codigoVendedor) continue;
    const atual = porDia.get(v.dataVenda) ?? { quantidadeItens: 0, valorVenda: 0, produtos: new Map<string, number>() };
    atual.quantidadeItens += 1;
    atual.valorVenda += v.valor;
    atual.produtos.set(v.nomeProduto, (atual.produtos.get(v.nomeProduto) ?? 0) + 1);
    porDia.set(v.dataVenda, atual);
  }
  return Array.from(porDia.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([data, info]) => ({
      data,
      quantidadeItens: info.quantidadeItens,
      valorVenda: info.valorVenda,
      produtos: Array.from(info.produtos.entries())
        .map(([nome, qtd]) => (qtd > 1 ? `${nome} (${qtd}x)` : nome))
        .join(', '),
    }));
}
