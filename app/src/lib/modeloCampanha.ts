import { ModeloCampanha } from '../types/domain';

export const ORDEM_MODELOS_CAMPANHA: ModeloCampanha[] = [
  'estoque_parado_60',
  'mips',
  'nao_medicamentos',
  'desodorantes',
  'bebe_idoso',
];

export const MODELO_CAMPANHA_LABEL: Record<ModeloCampanha, string> = {
  estoque_parado_60: 'Estoque parado 60+ dias',
  mips: 'MIPS',
  nao_medicamentos: 'Não medicamentos',
  desodorantes: 'Desodorantes',
  bebe_idoso: 'Semana do bebê e do idoso',
};

// Nome sugerido pro campo "Nome da campanha" ao escolher um modelo —
// mesma convenção usada hoje ("MIPS AGOSTO", "NÃO MEDICAMENTOS
// (AGOSTO)") — continua editável depois.
const NOMES_MES = [
  'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
  'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO',
];

export function nomeSugeridoPorModelo(modelo: ModeloCampanha, hoje: Date = new Date()): string {
  const mes = NOMES_MES[hoje.getMonth()];
  return `${MODELO_CAMPANHA_LABEL[modelo].toUpperCase()} (${mes})`;
}
