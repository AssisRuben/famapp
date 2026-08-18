import { macroGrupoDoProduto } from './macroGrupo';

// Arquivo à parte (mesmo motivo de estoqueParado.ts): precificacao.ts
// já importa de campanhas.ts, então essa função não pode morar em
// nenhum dos dois sem criar import circular quando o outro precisar
// dela também.
const MACRO_GRUPOS_POTENCIALMENTE_BAIXA_ELASTICIDADE = new Set(['eticos', 'genericos', 'similares']);

// Baixa elasticidade = medicamento (éticos/genéricos/similares) QUE
// EXIGE RECEITA — uso contínuo/prescrição, a compra acontece com ou
// sem desconto. [18/08/2026] Refinado: a versão original classificava
// esses 3 macro-grupos INTEIROS como baixa elasticidade, mas isso
// incluía MIPS (analgésico, antigripal de balcão — sem receita, mesmo
// macro-grupo) — na prática tão sensível a promoção quanto perfumaria/
// conveniência. O sinal real não é o grupo sozinho, é exigir receita
// ou não (tipoLista) DENTRO desses grupos.
export function ehBaixaElasticidade(grupo: string | undefined, tipoLista: string | null | undefined): boolean {
  const macro = macroGrupoDoProduto(grupo);
  if (!macro || !MACRO_GRUPOS_POTENCIALMENTE_BAIXA_ELASTICIDADE.has(macro)) return false;
  return !!tipoLista?.trim();
}
