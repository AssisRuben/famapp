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

// Mesma ideia, mas pra conteúdo binário (ex.: XLSX) que só existe como
// base64 — precisa decodificar pra bytes antes de virar Blob, senão o
// arquivo baixa corrompido (texto base64 salvo como se fosse o binário).
export function baixarArquivoBase64NoWeb(nomeArquivo: string, base64: string, mimeType: string): void {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) {
    bytes[i] = binario.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
