import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { CampanhaProduto } from '../types/domain';
import { alertar } from './alert';
import { baixarArquivoTextoNoWeb } from './downloadWeb';
import { gerarTxtTrier } from './trierTxt';

// Exporta o .txt de importação do Trier — usado em Cartazetes e direto
// no card da lista de Campanhas (24/09/2026: nem toda campanha gera
// cartaz, e o .txt não pode depender de passar por lá).
//
// Fica de fora do arquivo:
// - grupo de controle do motor: por definição fica a preço normal;
// - produto "Kit": o formato é 1 preço fixo por linha, não tem como
//   representar leve-mais-pague-menos (a Trier não tem formato
//   confirmado pra isso). Avisa quantos ficaram de fora.
//
// `produtos` precisa vir com código de barras resolvido (getCampanha,
// não a lista leve de getCampanhas).
export async function exportarTxtCampanha(campanhaId: string, produtos: CampanhaProduto[]): Promise<void> {
  const semControle = produtos.filter((p) => p.braco !== 'controle');
  const naoKit = semControle.filter((p) => p.tipoPromocao !== 'kit');
  // Sem código de barras a linha sai com "" e a Trier recusa o arquivo
  // inteiro (22/10/2026) — fica de fora e avisa.
  const unitarios = naoKit.filter((p) => p.codigoBarras.trim() !== '');
  const semCodigoBarras = naoKit.filter((p) => p.codigoBarras.trim() === '');
  if (unitarios.length === 0) {
    alertar(
      'Nada pra exportar',
      semControle.length > 0
        ? 'Todos os produtos dessa campanha estão como "Kit" — o formato de importação da Trier ainda não suporta esse tipo de promoção.'
        : 'Essa campanha não tem produto com desconto pra exportar.'
    );
    return;
  }

  const conteudo = gerarTxtTrier(unitarios);
  const nomeArquivo = `campanha-${campanhaId}.txt`;

  if (Platform.OS === 'web') {
    baixarArquivoTextoNoWeb(nomeArquivo, conteudo);
  } else {
    const uri = `${FileSystem.documentDirectory}${nomeArquivo}`;
    await FileSystem.writeAsStringAsync(uri, conteudo);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: 'text/plain', dialogTitle: 'Exportar para importação no Trier' });
    } else {
      alertar('Arquivo gerado', `Salvo em: ${uri}`);
    }
  }

  if (semCodigoBarras.length > 0) {
    alertar(
      'Produtos sem código de barras',
      `${semCodigoBarras.length} produto(s) ficaram fora do .txt por não ter código de barras no cadastro: ` +
        semCodigoBarras.map((p) => `${p.nomeProduto} (cód. ${p.codigoProduto})`).join(', ')
    );
  }

  const puladosKit = semControle.length - naoKit.length;
  if (puladosKit > 0) {
    alertar(
      'Kits não exportados',
      `${puladosKit} produto(s) "Kit" não entraram no .txt — cadastre essa promoção direto no sistema, se precisar.`
    );
  }
}
