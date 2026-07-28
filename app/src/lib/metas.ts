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
