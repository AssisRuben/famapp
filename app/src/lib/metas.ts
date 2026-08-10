import { FaixaComissao, MetaVendedor } from '../types/domain';
import { PeriodoMeta } from '../components/PeriodoMetaSelector';

export const NOMES_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export function diasNoMes(ano: number, mes: number): number {
  return new Date(ano, mes, 0).getDate();
}

// Medalha de gamificação por faixa de comissão alcançada (5/7/8/10% —
// o piso de 3% nunca aparece aqui, não é uma conquista, é o ponto de
// partida). Mesma escala usada no push de "subiu de faixa" (n8n) e no
// badge mostrado em Meta/Metas — ver comissao_faixa_alcancada no
// schema.sql.
const BADGES_FAIXA_COMISSAO: Record<number, string> = {
  5: '🥉',
  7: '🥈',
  8: '🥇',
  10: '🏆',
};

export function badgeFaixaComissao(faixaAlcancada: number | null): string | null {
  if (faixaAlcancada == null) return null;
  return BADGES_FAIXA_COMISSAO[faixaAlcancada] ?? null;
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

// Total de dias dentro de um bucket de semana (ver semanaDoDia) —
// diferente de diasDecorridosNaSemana, que para no dia de hoje; este
// conta o bucket inteiro, usado pra dividir "quanto falta" pelos dias
// que ainda restam.
export function diasNoBucketSemana(semana: 1 | 2 | 3 | 4, ano: number, mes: number): number {
  const inicio = semana === 1 ? 1 : semana === 2 ? 8 : semana === 3 ? 15 : 22;
  const fim = semana === 4 ? diasNoMes(ano, mes) : semana * 7;
  return fim - inicio + 1;
}

// Acha a faixa de comissão pelo % da meta batido (>=100→10%, >=90→8%,
// >=80→7%, >=70→5%, <70→3% — ver faixas_comissao no banco). `faixas`
// precisa vir ordenado por percentualMetaMin desc (getFaixasComissao já
// traz assim); a menor faixa é o piso padrão.
export function faixaComissaoPara(faixas: FaixaComissao[], percentual: number): FaixaComissao | undefined {
  return faixas.find((f) => f.percentualMetaMin <= percentual) ?? faixas[faixas.length - 1];
}

// Meta é de margem bruta em R$, não faturamento (01/08/2026) — label
// deixa isso explícito pra não confundir com meta de venda. Usado no
// card "Metas" do Dashboard e na aba "Meta" (dia/semana/mês + comissão).
export function valoresDaMeta(
  meta: MetaVendedor,
  periodo: PeriodoMeta,
  realizadoHoje: number,
  semanaAtual: number
): { label: string; valorMeta: number; valorRealizado: number } {
  if (periodo === 'dia') {
    return {
      label: 'Meta de margem do dia',
      valorMeta: metaDiaria(meta.valorMetaMensal, meta.ano, meta.mes),
      valorRealizado: realizadoHoje,
    };
  }
  if (periodo === 'semana') {
    const semana = meta.semanas.find((s) => s.semana === semanaAtual);
    return {
      label: `Meta de margem da semana (${semana?.rotulo ?? ''})`,
      valorMeta: semana?.valorMeta ?? 0,
      valorRealizado: semana?.valorRealizado ?? 0,
    };
  }
  return { label: 'Meta de margem do mês', valorMeta: meta.valorMetaMensal, valorRealizado: meta.valorRealizadoMensal };
}

// Comissão de dia/semana é sempre APROXIMAÇÃO (só o fechamento MENSAL é
// oficial/congelado — ver vw_metas_comissao no schema.sql): pega a
// faixa batida pelo % da meta do período e aplica sobre o realizado.
// Não considera a regra flat_10_mensal (só vale pro mês fechado
// inteiro), então dia/semana podem "prometer" uma comissão que o
// fechamento do mês depois substitui por 10% flat se a meta mensal for
// batida — por isso o rótulo "aproximado" é sempre exibido junto.
export function comissaoAproximada(
  valorRealizado: number,
  valorMeta: number,
  faixas: FaixaComissao[]
): { percentual: number; taxa: number; comissaoValor: number } {
  if (valorMeta <= 0) return { percentual: 0, taxa: 0, comissaoValor: 0 };
  const percentual = (valorRealizado / valorMeta) * 100;
  const taxa = faixaComissaoPara(faixas, percentual)?.percentualComissao ?? 0;
  return { percentual, taxa, comissaoValor: valorRealizado * (taxa / 100) };
}
