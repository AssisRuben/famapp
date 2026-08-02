import { FaixaComissao } from '../types/domain';

export const NOMES_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export function diasNoMes(ano: number, mes: number): number {
  return new Date(ano, mes, 0).getDate();
}

// Buckets fixos: 1–7, 8–14, 15–21, 22–fim do mês.
export function semanaDoDia(dia: number): 1 | 2 | 3 | 4 {
  if (dia <= 7) return 1;
  if (dia <= 14) return 2;
  if (dia <= 21) return 3;
  return 4;
}

export function rotuloSemana(semana: 1 | 2 | 3 | 4, ano: number, mes: number): string {
  if (semana === 1) return '1–7';
  if (semana === 2) return '8–14';
  if (semana === 3) return '15–21';
  return `22–${diasNoMes(ano, mes)}`;
}

export function mesAnoLabel(ano: number, mes: number): string {
  return `${NOMES_MES[mes - 1]} de ${ano}`;
}

// Meta do dia não é cadastrada — é sempre a meta mensal dividida pela
// quantidade de dias do mês (28/29 em fevereiro, 30 ou 31 nos demais).
export function metaDiaria(valorMetaMensal: number, ano: number, mes: number): number {
  return valorMetaMensal / diasNoMes(ano, mes);
}

// Dias decorridos dentro de um bucket de semana (ver semanaDoDia) até
// hoje — usado pra tirar média diária dentro da semana corrente, igual
// já se faz pro mês (dividir pelo dia do mês em vez do total de dias).
// Semana de mês/ano diferente do atual, ou já encerrada no mês
// corrente, retorna o tamanho cheio do bucket (7 dias, ou o resto do
// mês na semana 4).
export function diasDecorridosNaSemana(ano: number, mes: number, semana: 1 | 2 | 3 | 4, hoje: Date = new Date()): number {
  const inicio = semana === 1 ? 1 : semana === 2 ? 8 : semana === 3 ? 15 : 22;
  const fim = semana === 4 ? diasNoMes(ano, mes) : semana * 7;
  const ehMesCorrente = hoje.getFullYear() === ano && hoje.getMonth() + 1 === mes;
  if (!ehMesCorrente) return fim - inicio + 1;
  const diaAtual = hoje.getDate();
  if (diaAtual < inicio) return 1; // semana futura — evita divisão por 0
  if (diaAtual > fim) return fim - inicio + 1; // semana já encerrada
  return diaAtual - inicio + 1;
}

// Acha a faixa de comissão pelo % da meta batido (>=100→10%, >=90→8%,
// >=80→7%, >=70→5%, <70→3% — ver faixas_comissao no banco). `faixas`
// precisa vir ordenado por percentualMetaMin desc (getFaixasComissao já
// traz assim); a menor faixa é o piso padrão.
export function faixaComissaoPara(faixas: FaixaComissao[], percentual: number): FaixaComissao | undefined {
  return faixas.find((f) => f.percentualMetaMin <= percentual) ?? faixas[faixas.length - 1];
}
