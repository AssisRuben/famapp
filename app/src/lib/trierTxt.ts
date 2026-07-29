import { CampanhaProduto } from '../types/domain';

// Layout inferido de docs/txt.txt (arquivo de referência real que a
// farmácia já usa). Campos 3 e 4 seguem "0" como no exemplo — o
// significado exato deles NÃO está confirmado (sem doc oficial da
// Trier pra esse import, só o arquivo de exemplo). Valide com um
// import de teste em homologação antes de usar em produção.
export const CODIGO_FILIAL_PADRAO = '151';

function formatarDataTrier(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function escaparCampo(valor: string): string {
  return valor.replace(/"/g, "'");
}

// Cada produto já carrega a própria validade (editável na tela de
// Cartazetes), então cada linha do .txt usa a validade do seu item —
// não existe mais um período único pra campanha inteira.
export function gerarTxtTrier(produtos: CampanhaProduto[], codigoFilial: string = CODIGO_FILIAL_PADRAO): string {
  return produtos
    .map((produto) => {
      const campos = [
        codigoFilial,
        produto.codigoBarras,
        '0',
        '0',
        formatarDataTrier(produto.dataInicio),
        formatarDataTrier(produto.dataFim),
        produto.precoPromocional.toFixed(2),
        escaparCampo(produto.nomeProduto),
      ];
      return `"${campos.join('","')}";`;
    })
    .join('\n');
}
