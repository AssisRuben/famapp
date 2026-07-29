// Alert.alert() no react-native-web é um no-op literal (ver
// node_modules/react-native-web/src/exports/Alert/index.js: "static
// alert() {}") — por isso um aviso "use outro dispositivo" no web não
// aparecia nada. Em vez de só avisar, baixamos o arquivo de verdade
// usando a API padrão do navegador.
export function baixarArquivoTextoNoWeb(nomeArquivo: string, conteudo: string): void {
  const blob = new Blob([conteudo], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
