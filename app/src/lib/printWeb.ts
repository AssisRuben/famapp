// expo-print no navegador NÃO imprime o HTML recebido — a implementação
// web da lib só chama window.print() na página atual (ver
// node_modules/expo-print/src/ExponentPrint.web.ts), o que imprimia o
// próprio app em vez do cartaz. Aqui abrimos o HTML gerado numa aba
// nova e mandamos imprimir só ela.
export function imprimirHtmlNoWeb(html: string): void {
  // SEM noopener/noreferrer de propósito: com essas flags o navegador
  // devolve null como referência da janela (é assim que isolam a nova
  // aba do opener), e sem referência não dá pra escrever o HTML nela —
  // é exatamente por isso que a aba abria em branco. Aqui é conteúdo
  // nosso, gerado localmente, não tem risco de abrir URL de terceiro.
  const janela = window.open('', '_blank');
  if (!janela) {
    throw new Error('O navegador bloqueou a janela de impressão. Permita pop-ups pra este site e tente de novo.');
  }
  janela.document.open();
  janela.document.write(html);
  janela.document.close();
  // pequeno atraso pra garantir que o layout/CSS terminou de renderizar
  // antes de abrir a folha de impressão.
  setTimeout(() => {
    janela.focus();
    janela.print();
  }, 300);
}
