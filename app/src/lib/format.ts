export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Mesma formatação, sem casas decimais — usado em cards compactos onde
// o centavo não muda a leitura do número e só ocupa espaço/faz quebrar
// linha (ex.: tiles de indicador no Dashboard).
export function formatBRLSemCentavos(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

export function formatDateBR(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

// Ano com 2 dígitos (DD/MM/AA) — usado nos campos compactos de edição de
// validade do cartazete.
export function formatDateCurtoBR(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year.slice(-2)}`;
}

// Aceita DD/MM/AA ou DD/MM/AAAA digitado pelo usuário e devolve ISO
// (AAAA-MM-DD). Ano de 2 dígitos assume século 20xx. Retorna null se o
// texto não for uma data válida (chamador decide o que fazer — ex.:
// ignorar e manter o valor anterior).
export function parseDateBR(texto: string): string | null {
  const match = texto.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!match) return null;
  const [, diaStr, mesStr, anoStr] = match;
  const ano = anoStr.length === 2 ? `20${anoStr}` : anoStr;
  const dia = Number(diaStr);
  const mes = Number(mesStr);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

// Formata número com vírgula decimal (padrão BR: "12,50"), sem símbolo
// de moeda — usado nos campos editáveis de preço/desconto.
export function formatDecimalBR(valor: number): string {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Aceita "12,50" ou "12.50" (vírgula ou ponto como separador decimal) e
// devolve number. Texto inválido vira 0.
export function parseDecimalBR(texto: string): number {
  const t = texto.trim();
  // com vírgula: ponto é separador de milhar ("1.234,56"); sem vírgula,
  // o ponto (se houver) já é o separador decimal ("12.5").
  if (t.includes(',')) {
    return Number(t.replace(/\./g, '').replace(',', '.')) || 0;
  }
  return Number(t) || 0;
}

// Data local (não UTC) — toISOString() já causou o Painel pedir o dia
// errado à noite no Brasil (UTC-3): passada a meia-noite em UTC mas
// ainda "hoje" localmente, toISOString() já devolvia o dia seguinte,
// que naturalmente não tem venda nenhuma ainda.
export function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// de/da/do/das/dos não contam como um dos 2 nomes — ficam grudadas no
// nome seguinte ("MARIA DE LOURDES" -> "Maria de Lourdes", não "Maria
// De"), sempre minúsculas, do jeito que se escreve de verdade.
const PREPOSICOES_NOME = new Set(['de', 'da', 'do', 'das', 'dos']);

// Nome pra mensagem de WhatsApp: só os 2 primeiros nomes, Title Case
// (a Trier manda nome em CAIXA ALTA — "MARCOS ANDRADE" — que soa
// robótico numa mensagem) e sem hífen (vira espaço, cobre tanto nome
// composto "ANA-MARIA" quanto sujeira de cadastro tipo "NOME -
// FILIAL") — pra soar mais como mensagem escrita por humano.
export function nomeCurto(nomeCompleto: string): string {
  const palavras = nomeCompleto.replace(/-/g, ' ').trim().split(/\s+/).filter(Boolean);
  const resultado: string[] = [];
  let nomesReais = 0;

  for (const palavraOriginal of palavras) {
    const palavraMinuscula = palavraOriginal.toLowerCase();
    const ehPreposicao = PREPOSICOES_NOME.has(palavraMinuscula);

    if (ehPreposicao && resultado.length > 0 && nomesReais < 2) {
      resultado.push(palavraMinuscula);
      continue;
    }
    if (nomesReais >= 2) break;
    resultado.push(palavraOriginal.charAt(0).toUpperCase() + palavraOriginal.slice(1).toLowerCase());
    nomesReais += 1;
  }

  // preposição penduricada no fim sem nome depois (ex.: nome cortado
  // bem em cima da preposição) fica estranha — tira.
  while (resultado.length > 0 && PREPOSICOES_NOME.has(resultado[resultado.length - 1])) {
    resultado.pop();
  }

  return resultado.join(' ');
}

export function formatDateHoraBR(iso: string): string {
  const d = new Date(iso);
  const data = d.toLocaleDateString('pt-BR');
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${data} às ${hora}`;
}
