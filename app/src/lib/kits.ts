import { KitMultiProduto, KitPromocao } from '../types/domain';
import { formatBRL } from './format';

// Presets comuns (18/08/2026, espelhando exemplos reais passados pelo
// usuário: "compre 3 pague 2", "50% no 2º item", "25% no 2º item") —
// a tela ainda permite digitar outro valor além desses.
export const PRESETS_KIT: { label: string; kit: KitPromocao }[] = [
  { label: 'Compre 3, pague 2', kit: { quantidadeMinima: 3, tipoPrecificacao: 'percentual', percentualDescontoItem: 100, precoFixo: null } },
  { label: '50% no 2º item', kit: { quantidadeMinima: 2, tipoPrecificacao: 'percentual', percentualDescontoItem: 50, precoFixo: null } },
  { label: '25% no 2º item', kit: { quantidadeMinima: 2, tipoPrecificacao: 'percentual', percentualDescontoItem: 25, precoFixo: null } },
];

// Texto curto pro cartaz/lista de produtos. Dois formatos (02/09/2026):
// preço fixo pras N unidades (ex.: "3 por R$29,90") ou percentual no
// último item (comportamento original).
export function descricaoKit(kit: KitPromocao): string {
  if (kit.tipoPrecificacao === 'preco_fixo' && kit.precoFixo != null) {
    return `${kit.quantidadeMinima} por ${formatBRL(kit.precoFixo)}`;
  }
  const pct = kit.percentualDescontoItem ?? 0;
  if (pct >= 100) {
    return `Compre ${kit.quantidadeMinima}, pague ${kit.quantidadeMinima - 1}`;
  }
  return `Leve ${kit.quantidadeMinima}, ${pct.toLocaleString('pt-BR')}% OFF no ${kit.quantidadeMinima}º item`;
}

function round2(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export interface ProdutoParaKit {
  precoVenda: number;
  custoMedio: number;
  quantidade: number;
}

function totais(produtos: ProdutoParaKit[]): { totalRegular: number; totalCusto: number } {
  return produtos.reduce(
    (acc, p) => ({
      totalRegular: acc.totalRegular + p.precoVenda * p.quantidade,
      totalCusto: acc.totalCusto + p.custoMedio * p.quantidade,
    }),
    { totalRegular: 0, totalCusto: 0 }
  );
}

// Mesmo clamp de calcularDescontoSustentavel (lib/campanhas.ts), só que
// trocando "um produto" pela SOMA da lista — nunca deixa a margem
// resultante do combo cair abaixo do piso, mesmo que o desconto alvo
// pedido seja mais agressivo.
export function calcularKitPercentualSustentavel(
  produtos: ProdutoParaKit[],
  descontoAlvoPct: number,
  margemMinimaPct: number
): { percentualDesconto: number; precoTotalComDesconto: number; margemResultantePct: number } {
  const { totalRegular, totalCusto } = totais(produtos);
  const margemMinimaSegura = Math.min(95, Math.max(0, margemMinimaPct));
  const precoMinimoPelaMargem = totalCusto / (1 - margemMinimaSegura / 100);
  const precoComDescontoAlvo = totalRegular * (1 - descontoAlvoPct / 100);
  const precoTotalComDesconto = Math.max(precoComDescontoAlvo, precoMinimoPelaMargem, totalCusto);
  const percentualDesconto =
    totalRegular > 0 ? Math.max(0, ((totalRegular - precoTotalComDesconto) / totalRegular) * 100) : 0;
  return {
    percentualDesconto: round2(percentualDesconto),
    precoTotalComDesconto: round2(precoTotalComDesconto),
    margemResultantePct: round2(precoTotalComDesconto > 0 ? ((precoTotalComDesconto - totalCusto) / precoTotalComDesconto) * 100 : 0),
  };
}

// Sem desconto alvo (diferente da versão percentual) — o "preço fixo"
// não tem um alvo natural pra ancorar, então parte do MAIS agressivo
// sustentável (preço onde a margem bate exatamente o piso) como
// sugestão inicial; o gestor sobe o valor na tela se quiser desconto
// menor.
export function calcularKitPrecoFixoSustentavel(
  produtos: ProdutoParaKit[],
  margemMinimaPct: number
): { precoFixo: number; margemResultantePct: number } {
  const { totalRegular, totalCusto } = totais(produtos);
  const margemMinimaSegura = Math.min(95, Math.max(0, margemMinimaPct));
  const precoMinimoPelaMargem = totalCusto / (1 - margemMinimaSegura / 100);
  const precoFixo = Math.min(totalRegular, Math.max(precoMinimoPelaMargem, totalCusto));
  return {
    precoFixo: round2(precoFixo),
    margemResultantePct: round2(precoFixo > 0 ? ((precoFixo - totalCusto) / precoFixo) * 100 : 0),
  };
}

// Margem resultante do kit de PRODUTO ÚNICO, pro preço que está
// configurado agora (diferente de calcularKitPercentualSustentavel/
// calcularKitPrecoFixoSustentavel, que calculam uma SUGESTÃO — aqui é
// só "quanto sobra" no valor que o gestor já digitou, pra exibir na
// tela). Preço médio pago por unidade: no percentual, só a Nº unidade
// leva o desconto (mesma semântica de "compre N pague N-1"); no preço
// fixo, é o total dividido pelas N unidades.
export function margemResultanteKitProdutoUnico(
  kit: KitPromocao,
  precoRegular: number,
  custoMedio: number
): { totalCusto: number; totalPago: number; precoMedioUnidade: number; margemPct: number } {
  const totalPago =
    kit.tipoPrecificacao === 'preco_fixo'
      ? kit.precoFixo ?? precoRegular * kit.quantidadeMinima
      : precoRegular * (kit.quantidadeMinima - 1) + precoRegular * (1 - (kit.percentualDescontoItem ?? 0) / 100);
  const totalCusto = custoMedio * kit.quantidadeMinima;
  const precoMedioUnidade = kit.quantidadeMinima > 0 ? totalPago / kit.quantidadeMinima : 0;
  return {
    totalCusto: round2(totalCusto),
    totalPago: round2(totalPago),
    precoMedioUnidade: round2(precoMedioUnidade),
    margemPct: round2(precoMedioUnidade > 0 ? ((precoMedioUnidade - custoMedio) / precoMedioUnidade) * 100 : 0),
  };
}

// Mesma ideia, pro kit MULTI-produto — custo e preço final já
// resolvidos a partir de kit.produtos (cada um já traz seu próprio
// precoRegular/custoMedio).
export function margemResultanteKitMultiProduto(kit: KitMultiProduto): { totalCusto: number; precoFinal: number; margemPct: number } {
  const totalRegular = kit.produtos.reduce((acc, p) => acc + p.precoRegular * p.quantidade, 0);
  const totalCusto = kit.produtos.reduce((acc, p) => acc + p.custoMedio * p.quantidade, 0);
  const precoFinal =
    kit.tipoPrecificacao === 'preco_fixo' ? kit.precoFixo ?? totalRegular : totalRegular * (1 - (kit.percentualDescontoItem ?? 0) / 100);
  return {
    totalCusto: round2(totalCusto),
    precoFinal: round2(precoFinal),
    margemPct: round2(precoFinal > 0 ? ((precoFinal - totalCusto) / precoFinal) * 100 : 0),
  };
}

// Texto curto pro cartaz/lista — análogo a descricaoKit(), mas pra
// bundle de produtos DIFERENTES (não faz sentido falar em "2º item"
// quando os produtos do kit não são o mesmo SKU).
export function descricaoKitMultiProduto(kit: KitMultiProduto): string {
  const nomes = kit.produtos.map((p) => (p.quantidade > 1 ? `${p.nomeProduto} (${p.quantidade}x)` : p.nomeProduto)).join(' + ');
  if (kit.tipoPrecificacao === 'preco_fixo' && kit.precoFixo != null) {
    return `Leve ${nomes} por ${formatBRL(kit.precoFixo)}`;
  }
  if (kit.percentualDescontoItem != null) {
    // toLocaleString (não interpolação crua) — número com casa decimal
    // (ex.: 12.5) vira "12.5" com PONTO via toString(), errado no
    // padrão BR usado no resto do texto/cartaz impresso.
    return `Leve ${nomes} com ${kit.percentualDescontoItem.toLocaleString('pt-BR')}% OFF no combo`;
  }
  return nomes;
}
