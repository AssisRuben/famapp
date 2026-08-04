import { CampanhaVendaAdicional, CriterioQuantidadeVendaAdicional, VendaVendaAdicional } from '../types/domain';

export interface AcumuladoVendedorVendaAdicional {
  codigoVendedor: number;
  nomeVendedor: string;
  // criterio='acumulado_periodo': soma de tudo que o vendedor vendeu
  // no período. criterio='mesma_venda': o MAIOR cupom individual dele
  // (não a soma) — é o "vendeu 2 juntas na mesma nota".
  quantidadeTotal: number;
}

// Agrupa por vendedor conforme o critério da campanha — base tanto do
// ranking (top N) quanto da meta individual (quem bateu
// meta_quantidade ganha o mesmo prêmio, sem ranking).
export function agruparPorVendedor(
  vendas: VendaVendaAdicional[],
  criterio: CriterioQuantidadeVendaAdicional = 'acumulado_periodo'
): AcumuladoVendedorVendaAdicional[] {
  // Filtra fora venda que veio SOZINHA na nota (qtdItensNaVenda<=1)
  // antes de qualquer conta — depois disso é a mesma soma de
  // 'acumulado_periodo', só que só em cima do que sobrou.
  if (criterio === 'venda_com_outros_itens') {
    vendas = vendas.filter((v) => v.qtdItensNaVenda > 1);
  }

  if (criterio === 'mesma_venda') {
    // soma quantidade DENTRO de cada nota (duas linhas do mesmo
    // produto — ou produtos diferentes da campanha — na mesma venda
    // contam juntas), depois pega o maior cupom entre as notas do
    // vendedor.
    const porVendedorPorVenda = new Map<number, Map<string, number>>();
    const nomePorVendedor = new Map<number, string>();
    for (const v of vendas) {
      if (v.codigoVendedor == null) continue;
      nomePorVendedor.set(v.codigoVendedor, v.nomeVendedor ?? `Vendedor ${v.codigoVendedor}`);
      const porVenda = porVendedorPorVenda.get(v.codigoVendedor) ?? new Map<string, number>();
      porVenda.set(v.vendaId, (porVenda.get(v.vendaId) ?? 0) + v.quantidade);
      porVendedorPorVenda.set(v.codigoVendedor, porVenda);
    }
    return Array.from(porVendedorPorVenda.entries()).map(([codigoVendedor, porVenda]) => ({
      codigoVendedor,
      nomeVendedor: nomePorVendedor.get(codigoVendedor) ?? `Vendedor ${codigoVendedor}`,
      quantidadeTotal: Math.max(...porVenda.values()),
    }));
  }

  const porVendedor = new Map<number, AcumuladoVendedorVendaAdicional>();
  for (const v of vendas) {
    if (v.codigoVendedor == null) continue;
    const atual = porVendedor.get(v.codigoVendedor) ?? {
      codigoVendedor: v.codigoVendedor,
      nomeVendedor: v.nomeVendedor ?? `Vendedor ${v.codigoVendedor}`,
      quantidadeTotal: 0,
    };
    atual.quantidadeTotal += v.quantidade;
    porVendedor.set(v.codigoVendedor, atual);
  }
  return Array.from(porVendedor.values());
}

export interface RankingVendaAdicionalItem extends AcumuladoVendedorVendaAdicional {
  posicao: number;
  premio: number | null;
}

// tipo_premiacao='ranking': ordena por quantidade desc, atribui a
// posição, e casa com premiacao_ranking (ex.: 1º=R$200) pelo número da
// posição — quem fica fora das posições premiadas recebe premio=null.
// minimoParaConcorrer (opcional, ex.: "concorre a partir de 5") filtra
// fora quem vendeu menos que isso ANTES de numerar as posições — não
// aparece no ranking nem como "sem prêmio", simplesmente não concorre
// (03/08/2026).
export function calcularRankingVendaAdicional(
  vendas: VendaVendaAdicional[],
  campanha: CampanhaVendaAdicional
): RankingVendaAdicionalItem[] {
  const premios = campanha.premiacaoRanking ?? [];
  const minimo = campanha.minimoParaConcorrer ?? 0;
  return agruparPorVendedor(vendas, campanha.criterioQuantidade)
    .filter((item) => item.quantidadeTotal >= minimo)
    .sort((a, b) => b.quantidadeTotal - a.quantidadeTotal)
    .map((item, index) => {
      const posicao = index + 1;
      return { ...item, posicao, premio: premios.find((p) => p.posicao === posicao)?.valor ?? null };
    });
}

export interface MetaIndividualVendaAdicionalItem extends AcumuladoVendedorVendaAdicional {
  bateu: boolean;
  premio: number | null;
}

// tipo_premiacao='meta_individual': todo vendedor que alcançar
// meta_quantidade ganha premiacao_meta_valor — não é ranking, todo
// mundo que bater pode ganhar.
export function calcularMetaIndividualVendaAdicional(
  vendas: VendaVendaAdicional[],
  campanha: CampanhaVendaAdicional
): MetaIndividualVendaAdicionalItem[] {
  const meta = campanha.metaQuantidade ?? 0;
  return agruparPorVendedor(vendas, campanha.criterioQuantidade)
    .sort((a, b) => b.quantidadeTotal - a.quantidadeTotal)
    .map((item) => {
      const bateu = meta > 0 && item.quantidadeTotal >= meta;
      return { ...item, bateu, premio: bateu ? campanha.premiacaoMetaValor : null };
    });
}

export function campanhaAtiva(campanha: CampanhaVendaAdicional, hojeIso: string): boolean {
  return campanha.dataInicio <= hojeIso && campanha.dataFim >= hojeIso;
}

// Filtra a LISTA de vendas (produto/cliente/data/horário) pra só
// mostrar o que realmente conta pro critério da campanha — sem isso, a
// lista mostrava toda venda bruta (até uma unidade só) misturada com
// vendas de verdade qualificadas, e o vendedor achava que aquela venda
// de 1 unidade estava contando pro ranking/meta quando na prática
// nunca contou (achado 03/08/2026 com dado real numa campanha
// 'mesma_venda').
export function filtrarVendasQualificadas(
  vendas: VendaVendaAdicional[],
  campanha: CampanhaVendaAdicional
): VendaVendaAdicional[] {
  if (campanha.criterioQuantidade === 'venda_com_outros_itens') {
    return vendas.filter((v) => v.qtdItensNaVenda > 1);
  }
  if (campanha.criterioQuantidade === 'mesma_venda') {
    // "mesma_venda" só faz sentido a partir de 2 (senão não é "junto
    // com outra", é venda avulsa) — usa a meta cadastrada como piso
    // quando existir (meta_individual), ou 2 como padrão (ranking não
    // tem meta numérica configurada).
    const minimo = campanha.metaQuantidade ?? 2;
    const somaPorVendedorVenda = new Map<string, number>();
    for (const v of vendas) {
      if (v.codigoVendedor == null) continue;
      const chave = `${v.codigoVendedor}:${v.vendaId}`;
      somaPorVendedorVenda.set(chave, (somaPorVendedorVenda.get(chave) ?? 0) + v.quantidade);
    }
    return vendas.filter(
      (v) => v.codigoVendedor != null && (somaPorVendedorVenda.get(`${v.codigoVendedor}:${v.vendaId}`) ?? 0) >= minimo
    );
  }
  return vendas;
}
