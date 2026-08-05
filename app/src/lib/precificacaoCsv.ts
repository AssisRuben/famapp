import { ItemPrecificacao } from '../types/domain';
import { MACRO_GRUPO_LABEL, macroGrupoDoProduto } from './macroGrupo';
import { montarCsv } from './csv';

const TAG_LABEL: Record<string, string> = {
  candidato_reajuste: 'Candidato a reajuste',
  parado_avaliar_preco: 'Parado — avaliar preço',
  baixa_elasticidade: 'Baixa elasticidade',
  alta_elasticidade: 'Alta elasticidade',
};

function labelMacroGrupo(grupo: string | undefined): string {
  const macro = macroGrupoDoProduto(grupo);
  return macro ? MACRO_GRUPO_LABEL[macro] : '';
}

export function gerarCsvPrecificacao(itens: ItemPrecificacao[]): string {
  const cabecalho = [
    'Código',
    'Código de barras',
    'Produto',
    'Macro-grupo',
    'Grupo',
    'Giro (30 dias)',
    'Dias sem venda',
    'Preço de compra',
    'Preço de venda',
    'Em estoque',
    'Margem atual (%)',
    'Desconto ativo',
    'Sinais',
  ];

  const linhas = itens.map((item) => [
    String(item.produto.codigo),
    item.produto.codigoBarras,
    item.produto.nome,
    labelMacroGrupo(item.produto.grupo),
    item.produto.grupo ?? '',
    String(item.quantidadeVendida30d),
    item.diasSemVenda === null ? '' : String(item.diasSemVenda),
    item.produto.custoMedio.toFixed(2).replace('.', ','),
    item.produto.precoVenda.toFixed(2).replace('.', ','),
    String(item.produto.estoqueAtual),
    item.margemAtualPct.toFixed(1).replace('.', ','),
    item.temDescontoAtivo ? 'Sim' : 'Não',
    item.tags.map((tag) => TAG_LABEL[tag] ?? tag).join(' / '),
  ]);

  return montarCsv(cabecalho, linhas);
}
