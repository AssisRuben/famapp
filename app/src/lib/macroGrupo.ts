// produto_catalogo.grupo tem ~25 valores brutos (confirmado com dados
// reais de produção em 05/08/2026 — ver README.md#pendências-técnicas),
// muitos deles variantes do mesmo tipo de produto (ex.: "GENERICO",
// "GENERICO CONTROLADOS ", "GENERICO ANTIMICROBIANOS", "GENERICO
// ONEROSO" são todos genérico). Esse mapeamento agrupa em poucas
// macro-categorias práticas SEM esconder o grupo bruto — quem quiser o
// detalhe original continua podendo filtrar por ele (ver
// PrecificacaoScreen, filtro em duas camadas).
export type MacroGrupo =
  | 'eticos'
  | 'genericos'
  | 'similares'
  | 'perfumaria_higiene'
  | 'orelhinha'
  | 'infantil_puericultura'
  | 'alimentos_conveniencia'
  | 'hospitalar_linha_geral'
  | 'outros_administrativo';

export const ORDEM_MACRO_GRUPOS: MacroGrupo[] = [
  'eticos',
  'genericos',
  'similares',
  'perfumaria_higiene',
  'orelhinha',
  'infantil_puericultura',
  'alimentos_conveniencia',
  'hospitalar_linha_geral',
  'outros_administrativo',
];

export const MACRO_GRUPO_LABEL: Record<MacroGrupo, string> = {
  eticos: 'Éticos',
  genericos: 'Genéricos',
  similares: 'Similares',
  perfumaria_higiene: 'Perfumaria & Higiene',
  orelhinha: 'Orelhinha',
  infantil_puericultura: 'Infantil & Puericultura',
  alimentos_conveniencia: 'Alimentos & Conveniência',
  hospitalar_linha_geral: 'Hospitalar & Linha Geral',
  outros_administrativo: 'Outros/Administrativo',
};

// Prefixo sobre o grupo bruto normalizado — mesma técnica já usada em
// ehBaixaElasticidade (lib/precificacao.ts) pra cobrir as variantes
// "CONTROLADOS"/"ANTIMICROBIANOS"/"ONEROSO" de ETICO/GENERICO/SIMILAR
// sem listar cada uma. Ordem importa: a primeira regra que casar vence.
// Orelhinha tem classe própria (não é puericultura nem perfumaria) —
// pedido explícito, mesmo sendo só 34 produtos.
const REGRAS: { macro: MacroGrupo; prefixos: string[] }[] = [
  { macro: 'eticos', prefixos: ['ETICO'] },
  { macro: 'genericos', prefixos: ['GENERICO'] },
  { macro: 'similares', prefixos: ['SIMILAR'] },
  { macro: 'orelhinha', prefixos: ['ORELHINHA'] },
  { macro: 'infantil_puericultura', prefixos: ['FRALDAS', 'PRODUTOS INFANTIS'] },
  { macro: 'alimentos_conveniencia', prefixos: ['CHOCOLATE', 'SORVETE', 'LEITES', 'REFRIGERANTES', 'CONVENIENCIA'] },
  {
    macro: 'hospitalar_linha_geral',
    prefixos: ['PRODUTOS HOSPITALARES', 'LINHA GERAL', 'USO OU CONSUMO', 'PRODUTOS VARIADOS'],
  },
  { macro: 'outros_administrativo', prefixos: ['BONIFICACAO', 'AMBULATORIO', 'CADASTRO AUTOMATICO'] },
  { macro: 'perfumaria_higiene', prefixos: ['PERFUMARIA'] },
];

// Quando o grupo bruto é exatamente essa palavra (sem sufixo de
// variante), o nome já está contido no rótulo do macro-grupo — mostrar
// os dois juntos (ex. "Genéricos · GENERICO") fica redundante/"dobrado".
// Só as variantes (GENERICO CONTROLADOS, GENERICO ANTIMICROBIANOS...)
// têm informação nova o suficiente pra valer aparecer ao lado do macro.
const GRUPO_BASE_REDUNDANTE: Partial<Record<MacroGrupo, string>> = {
  eticos: 'ETICO',
  genericos: 'GENERICO',
  similares: 'SIMILAR',
  perfumaria_higiene: 'PERFUMARIA',
  orelhinha: 'ORELHINHA',
};

function normalizarGrupo(grupo: string): string {
  return grupo.trim().toUpperCase().replace(/\s+/g, ' ');
}

// null só quando o produto não tem grupo cadastrado. Grupo bruto
// desconhecido (novo valor que a Trier passe a mandar) cai em
// "outros_administrativo" em vez de sumir da tela sem filtro nenhum.
export function macroGrupoDoProduto(grupo: string | undefined): MacroGrupo | null {
  const normalizado = grupo ? normalizarGrupo(grupo) : '';
  if (!normalizado) return null;
  const regra = REGRAS.find((r) => r.prefixos.some((prefixo) => normalizado.startsWith(prefixo)));
  return regra?.macro ?? 'outros_administrativo';
}

// Rótulo pra exibição: macro-grupo sozinho quando o grupo bruto não
// acrescenta nada além do nome do próprio macro; "Macro · bruto" quando
// o grupo bruto é uma variante específica (controlado, antimicrobiano
// etc.) que vale a pena mostrar.
export function labelGrupoCompleto(grupo: string | undefined): string {
  const macro = macroGrupoDoProduto(grupo);
  if (!macro) return grupo ?? '';
  const normalizado = normalizarGrupo(grupo ?? '');
  if (normalizado === GRUPO_BASE_REDUNDANTE[macro]) return MACRO_GRUPO_LABEL[macro];
  return `${MACRO_GRUPO_LABEL[macro]} · ${grupo}`;
}
