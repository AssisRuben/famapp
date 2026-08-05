// BOM UTF-8 no início do arquivo — sem ele, o Excel no Windows não
// detecta a codificação como UTF-8 e lê os bytes como ANSI/Windows-1252,
// embaralhando acento ("ç", "ã", "é" viram "Ã§", "Ã£", "Ã©"). Com o BOM,
// o Excel reconhece UTF-8 sozinho — não precisa tirar acento do texto.
const BOM_UTF8 = '\uFEFF';

export function escaparCampoCsv(valor: string): string {
  // \r sozinho (sem \n) não separa linha pelo split usado aqui, mas
  // ainda corrompe a leitura em alguns programas (Excel/Notepad tratam
  // \r isolado como quebra) — por isso entra no gatilho de aspas junto
  // com "/;/\n, não só os dois últimos.
  if (/["\r\n;]/.test(valor)) {
    return `"${valor.replace(/"/g, '""')}"`;
  }
  return valor;
}

export function montarCsv(cabecalho: string[], linhas: string[][]): string {
  const todasLinhas = [cabecalho, ...linhas].map((colunas) => colunas.map(escaparCampoCsv).join(';'));
  return BOM_UTF8 + todasLinhas.join('\n');
}
