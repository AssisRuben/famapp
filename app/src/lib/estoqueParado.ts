// Quantos dias sem venda já contam como "parado" (referência: relatório
// de excesso do Dose Certa fala em dezenas/centenas de dias parado —
// 14 é um piso conservador, ajustável depois com dado real). Definição
// única, reaproveitada pelo diagnóstico de Precificação (lib/precificacao.ts)
// e pelo modo "liquidação" de sugestão de Campanhas (lib/campanhas.ts) —
// arquivo à parte pra evitar import circular entre os dois (precificacao.ts
// já importa de campanhas.ts).
export const LIMIAR_DIAS_PARADO = 14;

export function ehEstoqueParado(diasSemVenda: number | null, estoqueAtual: number): boolean {
  return diasSemVenda !== null && diasSemVenda >= LIMIAR_DIAS_PARADO && estoqueAtual > 0;
}
